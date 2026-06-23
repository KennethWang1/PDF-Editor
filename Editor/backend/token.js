const jwt = require('jsonwebtoken');
const fs = require('fs');
const pg = require('pg');
const { Client } = pg;
const { Pool } = pg;
const dotenv = require('dotenv');
const { version } = require('os');
const { verify } = require('crypto');
dotenv.config({ path: './.env' });

const privateKey = fs.readFileSync('./backend/env/private.key');
const refreshKey = fs.readFileSync('./backend/env/refresh.key');
const pool = new Pool({
  host: String(process.env.DB_HOST),
  user: String(process.env.DB_USER),
  database: String(process.env.DB_DATABASE),
  port: Number(process.env.DB_PORT),
  password: String(process.env.DB_PASSWORD),
});

pool.connect();

/**
 * Checks if the token is valid and if the version number matches the one in the database.
 * @param {Object} resToken 
 * @param {Number} v 
 * @returns Whether the token is valid or not.
 */
async function validateToken(resToken, v) {
  resToken = resToken.split(' ')[1];
  try {
    const decoded = jwt.verify(resToken, privateKey);
    const client = await pool.connect();
    const query = `SELECT version FROM tokenauth WHERE token = $1;`;
    const dbVersion = await client.query(query, [decoded.userToken]);

    if(dbVersion.rows[0].version != v || decoded.tokenVersion != v){
      throw new Error('Token Version Mismatch');
    }

    return true;
  } catch (err) {
      console.log(err);
    return false;
  }
}

/**
 * Creates a new user section in the tokenauth table. Also generates a new token and sets the version to 1.
 * @param {String} token unqiue user token (only used for db requests)
 * @returns [JWT token, version]
 */
async function createNewUser(token) {
  const query = `
    INSERT INTO tokenauth (token, version, jwt_token) 
    VALUES ($1, $2, $3);
  `;

  const values = [token, 0, ""];

  try {
    await pool.query(query, values);
    const userJWT = await generateUpdatedTokenWithVersion(token, 0);
    return userJWT;
  } catch (err) {
    if (err.code === '23505') {
      throw new Error('User with that token already exists.');
    }
    throw new Error('Token Generation Failed');
  }
}

/**
 * Generates and returns a JWT token with a 7 day lifespan based on the current token version.
 * @param {String} token unqiue user token (only used for db requests)
 * @returns [JWT token, version]
 */
async function generateToken(token){
  const client = await pool.connect();
  const v = await client.query(`SELECT version FROM tokenauth WHERE token = '${token}';`);
  client.release();

  const userJWT = jwt.sign({
    userToken: token,
    tokenVersion: v.rows[0].version
  }, privateKey, { expiresIn: '7d' });
  return [userJWT, v.rows[0].version];
}

/**
 * Bumps version number and returns a new JWT token
 * @param {String} token unqiue user token (only used for db requests)
 * @returns [JWT token, version]
 */
async function generateUpdatedToken(token){
  const client = await pool.connect();
  let v = (await pool.query(`SELECT version FROM tokenauth WHERE token = '${token}';`)).rows[0].version;
  v++;

  const userJWT = jwt.sign({
    userToken: token,
    tokenVersion: v
  }, privateKey, { expiresIn: '7d' });

  await client.query(`UPDATE tokenauth SET version = $1, jwt_token = $2 WHERE token = $3;`, [v, userJWT, token]);
  await client.release();

  return [userJWT, v];
}

/**
 * Bumps version number and returns a new JWT token
 * @param {String} token unqiue user token (only used for db requests)
 * @param {Number} v version number
 * @returns [JWT token, version]
 */
async function generateUpdatedTokenWithVersion(token, v){
  const client = await pool.connect();
  v++;

  const userJWT = jwt.sign({
    userToken: token,
    tokenVersion: v
  }, privateKey, { expiresIn: '7d' });

  await client.query(`UPDATE tokenauth SET version = $1, jwt_token = $2 WHERE token = $3;`, [v, userJWT, token]);
  await client.release();

  return [userJWT, v];
}

/**
 * Generates a refresh token based on user token (assumes user is already varified)
 * @param {String} token user (db) token
 * @returns returns a refresh token (1h)
 */
function generateRefreshToken(token){
  token = token.split(' ')[1];
  const refreshJWT = jwt.sign({
    userToken: token
  }, refreshKey, { expiresIn: '1h' });

  return refreshJWT;
}

//not finished
function verifyRefreshToken(refreshJWT){
  try {
    const decoded = jwt.verify(refreshJWT, refreshKey);
    return decoded;
  } catch (err) {
    console.log(err);
    return false;
  }
}

module.exports = {
  validateToken,
  createNewUser,
  generateToken,
  generateUpdatedToken,
  generateRefreshToken,
  verifyRefreshToken
};