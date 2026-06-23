const database = require('./database');
const express = require('express');
//const https = require("https");
const http = require("http");
const fs = require("fs");
const cors = require('cors');
const bodyParser = require("body-parser");
const app = express();
const path = require('path');
const token = require('./token');
//const { IncomingMessage } = require('http');

require('events').EventEmitter.defaultMaxListeners = 15;

const port = process.env.PORT;

app.use((req, res, next) => {
    console.log('Incoming request: ' + req.url);
    next();
});

//questionable safety
app.use(cors({
    origin: ['http://localhost:3000', 'https://localhost:3001'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/api/v1/checkToken', (req, res) => {
    const cookies = req.headers.authorization.split(',');
    if (token.validateToken(cookies[0], Number(cookies[1]))){
        res.setHeader('Content-Type', 'text/plain');
        res.status(200).json({refreshToken : token.generateRefreshToken(cookies[0])});
    }else{
        res.status(401).send('Unauthorized');
    }
});

app.post('/api/v1/login', async (req, res) => {
    if (Object.keys(req.body).length === 0) {
        return res.status(400).send('Request body is empty');
    }
    try {
        const response = await database.checkPassword(req.body.email, req.body.password);  
        console.log(response);
        if(!response){
            res.status(401).send('Login failed.');
        } else {
            res.setHeader('Set-Cookie', [`auth=${response[0]}; Secure`, `version=${response[1]}; Secure.`]);
            res.status(200).json({ message: 'Login successful', jwt: response[0], version: response[1] });
            res.end();
        }
    } catch (error) {
        console.log(error);
        if(error == 'Error: User not found'){
            res.status(401).send('Login failed.');
        }else{
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
        }else{
            console.error('Signup error:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

app.get('/api/v1/userinfo', async (req, res) => {
    console.log('Incoming Message');
    try {
        await database.getTable();
        res.send('Fetch succesful.');
        console.log('success');
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/test', async (req, res) => {
    try {
        res.send("Test Success");
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).send('Test Failed');
    }
});

app.use((req, res)=>{
    res.status(404).send('Not Found');
});
/*

const httpsServer = https.createServer({
    key: fs.readFileSync(path.join(__dirname, "env", "key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "env", "cert.pem"))
}, app);

httpsServer.listen(port, () => {
    console.log(`HTTPS server up and running on port ${port}`);
});
*/

http.createServer(app).listen(port, () => {
    console.log(`HTTP server up and running on port ${port}`);
});