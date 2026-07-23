const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const MAX_USER_STORAGE_BYTES = 50 * 1024 * 1024;

function getUserFiles(userToken) {
  if (!userToken) return [];
  const userDir = path.join(uploadsDir, String(userToken));
  if (!fs.existsSync(userDir)) return [];

  const files = fs.readdirSync(userDir);
  return files.map(filename => ({
    filename,
    url: `/api/v1/uploads/${userToken}/${filename}`
  }));
}

function getUserTokenFromReq(req) {
  const authHeader = req.headers.authorization || (req.query && req.query.authorization);
  if (!authHeader) return null;

  const parts = authHeader.split(',');
  const tokenStr = parts[0].trim();
  const version = parts[1] ? Number(parts[1].trim()) : (req.query && req.query.version ? Number(req.query.version) : null);

  const cleanToken = tokenStr.startsWith('Bearer ') ? tokenStr.slice(7) : tokenStr;

  try {
    const keyPath = path.join(__dirname, 'env', 'private.key');
    if (!fs.existsSync(keyPath)) return null;
    const privateKey = fs.readFileSync(keyPath);
    const decoded = jwt.verify(cleanToken, privateKey);
    if (decoded && decoded.userToken) {
      if (version !== null && version !== undefined && !isNaN(version)) {
        if (decoded.tokenVersion != version) return null;
      }
      return decoded.userToken;
    }
  } catch (err) {
    console.error('Token verification error:', err.message);
  }
  return null;
}

function getUserStorageUsed(userToken) {
  if (!userToken) return 0;
  const userDir = path.join(uploadsDir, String(userToken));
  if (!fs.existsSync(userDir)) return 0;

  let totalSize = 0;
  const files = fs.readdirSync(userDir);
  for (const file of files) {
    const filePath = path.join(userDir, file);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      totalSize += stat.size;
    }
  }
  return totalSize;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userToken = req.userToken || 'public';
    const userDir = path.join(uploadsDir, String(userToken));
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images (JPEG, PNG, GIF, WEBP, SVG) are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = {
  uploadsDir,
  storage,
  upload,
  getUserTokenFromReq,
  getUserStorageUsed,
  MAX_USER_STORAGE_BYTES,
  getUserFiles
};