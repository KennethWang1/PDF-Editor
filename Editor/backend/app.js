const database = require('./database');
const express = require('express');
const http = require("http");
const fs = require("fs");
const cors = require('cors');
const bodyParser = require("body-parser");
const app = express();
const path = require('path');
const token = require('./token');
const pdfServer = require('./pdfServer');

require('events').EventEmitter.defaultMaxListeners = 15;

const port = process.env.PORT || 3001;

app.use((req, res, next) => {
    console.log('Incoming request: ' + req.url);
    next();
});

app.use(cors({
    origin: ['http://localhost:3000', 'https://localhost:3001'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Protected Upload Endpoint enforcing authentication & quota
app.post('/api/v1/upload', (req, res, next) => {
  const userToken = pdfServer.getUserTokenFromReq(req);
  if (!userToken) {
    return res.status(401).json({ error: 'Unauthorized: A valid authorization token is required to upload files.' });
  }
  
  const currentUsage = pdfServer.getUserStorageUsed(userToken);
  if (currentUsage >= pdfServer.MAX_USER_STORAGE_BYTES) {
    return res.status(403).json({ error: 'Storage quota exceeded: You have reached the maximum allowed storage limit (50MB).' });
  }

  req.userToken = userToken;

  pdfServer.upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof require('multer').MulterError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `/api/v1/uploads/${userToken}/${req.file.filename}`;
    res.json({ url: fileUrl });
  });
});

app.get('/api/v1/uploads/:userToken/:filename', (req, res) => {
  const requestingUser = pdfServer.getUserTokenFromReq(req);
  if (!requestingUser) {
    return res.status(401).json({ error: 'Unauthorized access to file' });
  }

  if (requestingUser !== req.params.userToken) {
    return res.status(403).json({ error: 'Access denied: You do not have permission to view this file.' });
  }

  const filePath = path.join(pdfServer.uploadsDir, req.params.userToken, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});

app.get('/api/v1/my-images', (req, res) => {
  const userToken = pdfServer.getUserTokenFromReq(req);
  if (!userToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const files = pdfServer.getUserFiles(userToken);
  res.json({ files });
});

app.get('/api/v1/checkToken', (req, res) => {
    const cookies = req.headers.authorization.split(',');
    if (token.validateToken(cookies[0], Number(cookies[1]))){
        res.setHeader('Content-Type', 'text/plain');
        res.status(200).json({refreshToken : token.generateRefreshToken(cookies[0])});
    } else {
        res.status(401).send('Unauthorized');
    }
});

app.post('/api/v1/login', async (req, res) => {
    if (Object.keys(req.body).length === 0) {
        return res.status(400).send('Request body is empty');
    }
    try {
        const response = await database.checkPassword(req.body.email, req.body.password);  
        if(!response){
            res.status(401).send('Login failed.');
        } else {
            res.setHeader('Set-Cookie', [`auth=${response[0]}; Secure`, `version=${response[1]}; Secure.`]);
            res.status(200).json({ message: 'Login successful', jwt: response[0], version: response[1] });
            res.end();
        }
    } catch (error) {
        if(error == 'Error: User not found'){
            res.status(401).send('Login failed.');
        } else {
            console.error('Login error:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

app.post('/api/v1/signup', async (req, res) => {
    try {
        const jwt = await database.signup(req.body.username, req.body.firstName, req.body.lastName, req.body.email, req.body.password);
        if(jwt === undefined){
            throw new Error('Signup failed: jwt undefined');
        }
        res.setHeader('Set-Cookie', [`auth=${jwt[0]}; Secure`, `version=${jwt[1]}; Secure`]);
        res.status(200).json({ message: 'Signup successful', jwt: jwt[0], version: jwt[1] });
        res.end();
    } catch (error) {
        if(error.message === 'User with that email/username already exists.'){
            res.status(409).send('User with that email/username already exists.');
        } else {
            console.error('Signup error:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

app.use((req, res)=>{
    res.status(404).send('Not Found');
});

http.createServer(app).listen(port, () => {
    console.log(`HTTP server up and running on port ${port}`);
});