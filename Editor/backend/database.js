//todo: add error handling, prevent sql injection, add more security features

const pg = require('pg');
const crypto = require('crypto');
const dotenv = require('dotenv')
dotenv.config({ path: './.env' });
//const { Client } = pg;
const { Pool } = pg;
const argon2 = require('argon2');
const token = require('./token');

const pool = new Pool({
  host: String(process.env.DB_HOST),
  user: String(process.env.DB_USER),
  database: String(process.env.DB_DATABASE),
  port: Number(process.env.DB_PORT),
  password: String(process.env.DB_PASSWORD),
});

async function connectWithRetry(retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('Database connected successfully');
      client.release();
      return;
    } catch (err) {
      console.error(`Database connection failed. Retrying in ${delay / 1000} seconds...`, err.stack);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  console.error('Failed to connect to the database after multiple attempts.');
  process.exit(1);
}

connectWithRetry();

/**
 * Generates a random string of a given length
 * @param {Number} length length of the returned string
 * @returns random string of the specified length
 */
function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

/**
 * Creates a new user in the users table and a new token in the tokenauth table
 * @param {String} username users' username
 * @param {String} firstname users' first name
 * @param {String} lastname users' last name
 * @param {String} email users' email
 * @param {String} password users' password
 * @returns [JWT, version]
 */
async function signup(username, firstname, lastname, email, password) {
  let salt = Buffer.alloc(16);
  crypto.randomFillSync(salt);

  let t = generateRandomString(32);

  await argon2.hash(password, salt).then(async (hash) => {
    const query = `
      INSERT INTO users (password, first_name, last_name, username, email, salt, token) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const values = [hash, firstname, lastname, username, email, salt.toString('hex'), t];

    await pool.query(query, values);
  }).catch(err => {
    throw err;
  });

  while (true) {
    try {
      const rtn = await token.createNewUser(t);
      return rtn;
    } catch (error) {
      if (error.code === '23505') {
        t = generateRandomString(32)
        continue;
      }
      pool.query(`DELETE FROM users WHERE token = '${t}';`);
      pool.query(`DELETE FROM tokenauth WHERE token = '${t}';`);
      throw error;
    }
  }
}

//not working yet
function fetchUser(token) {
  
}

/**
 * Checks if the password & email provided matches the password&email in the database
 * @param {String} email users' email
 * @param {String} password users' password
 * @returns returns a [JWT, version] if the password matches, false otherwise
 */
async function checkPassword(email, password) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`SELECT password, token FROM users WHERE email = '${email}';`);
      if (result.rows.length > 0) {
        const match = await argon2.verify(result.rows[0].password, password);
        if (match) {
          return await token.generateToken(result.rows[0].token);
        } else {
          return false;
        }
      } else {
        throw new Error('User not found');
      }
    } finally {
      client.release();
    }
  } catch (error) {
    throw error;
  }
}

function getTable(){
  pool.connect((error, client, done) => {
    if (error) throw err;
      client.query('SELECT * FROM users;', (err, res) => {
        if (err){
          console.log(err.stack);
        } else {
          console.log(res.rows);
          //return res.rows;
        }
        //pool.end()
      })
  });
  return false;
}

module.exports = {
  fetchUser,
  signup,
  getTable,
  checkPassword
};