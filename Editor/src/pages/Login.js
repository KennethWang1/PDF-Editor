import './css/Login.css';
import { Link } from 'react-router-dom';

function Login() {
  if(document.cookie.includes('auth=') && document.cookie.includes('authVersion=') && checkToken(document.cookie.split('auth=')[1].split('xEnding//;')[0], document.cookie.split('authVersion=')[1].split('yEnding//;')[0])){
    window.location.href = '/dashboard';
  }

  return (
    <div username = "login-container" id = "login-container">
      <Link className = "exit-login" id = "exit-login" to={'/'}><img src = "/exitArrow.png" alt = "exitArrow" style={{backgroundRepeat: "no-repeat", backgroundSize: "contain", width: '25px', height:'20px'}}/></Link>
      <h1 className='login-title' id = 'login-title'>Sign In</h1>
      <div style={{position: 'relative',top: '4vh', alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div style={{paddingBottom: '10px'}}>
          <input name = "email" type="email" className="username" id="username" placeholder='Email:'/>
        </div>

        <div style={{padding: '10px'}}>
          <input name = "password" type="password" className="password" id="password" placeholder='Password:'/>
        </div>

        <button id="submitbutton" onClick={loginClick}>Login</button>
      </div>
      <h4 id = 'signup-link' className='signup-link'>Don't have an account? <a href='./signup' style={{textDecoration: 'underline', cursor: 'pointer', color: 'var(--tertiary)'}}>Sign up Here!</a></h4>
    </div>
  );
}

async function checkPassword(email, password) {
  //const response = await fetch(window.location.origin + '/api/v1/login', {
  const response = await fetch('http://localhost:3001/api/v1/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    redirect: "follow",
  });

  if(!response.ok) {
    throw new Error('Incorrect Password or Email');
  }
  const data = await response;
  return data;
}

function loginClick(){
  const email = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  const myPromise = new Promise(function(myResolve, myReject) {
    checkPassword(email, password).then((response) => {
      response.json().then((data) => {
        if(data.message != 'Login successful'){
          throw new Error('Login Failed');
        }
        
        document.cookie = `auth=${data.jwt}xEnding//; Secure`;
        document.cookie = `authVersion=${data.version}yEnding//; Secure`;
      });
      myResolve("OK");
    }).catch((err) => {
      myReject(err);
    });
  });
  
  myPromise.then(
    function(value) {
      //store token (should be done)
      window.location.href = '/dashboard';
      console.log('Login Successful');
    },
    function(error) {
      //pop up a red banner warning of a failed login
      //stay on login page
      console.log('Login Failed: ' + error);
    }
  );
}

async function checkT(t, v) {
  const response = await fetch(window.location.origin + '/api/v1/checkToken', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${[t,v]}`,
    },
    redirect: "follow",
  });
  const data = await response;
  document.cookie = `refreshToken=${data.json().refreshToken}; Secure`;
  //console.log(data.json());
  if(data.ok) {
    return true;
  }
  return false;
}

function checkToken(t, v){
  const myPromise = new Promise(async function(myResolve, myReject) {
    checkT(t, v).then((response) => {
      console.log(response);
      if(response){
        //document.cookie = `refreshToken=${response.json().refreshToken}; Secure`;
        myResolve("OK");
      }else{
        myReject("Failed");
      }
    }).catch((err) => {
      myReject(err);
    });
  });
  
  myPromise.then(
    function(value) {
      console.log('Token Valid');
      window.location.href = '/dashboard';
      //store token (should be done)
      return true;
    },
    function(error) {
      //pop up a red banner warning of a failed login
      //stay on login page
      return false;
    }
  );
}

export default Login;