import './css/Signup.css';
import { Link } from 'react-router-dom';

function Signup() {
  return (
    <div username = "signup-container" id = "signup-container">
      <Link className = "exit-signup" id = "exit-signup" to={'/'}><img src = "/exitArrow.png" alt = "exitArrow" style={{backgroundRepeat: "no-repeat", backgroundSize: "contain", width: '25px', height:'20px'}}/></Link>
      <h1 className='login-title' id = 'login-title'>Sign Up</h1>
      <div style={{position: 'relative',top: '0vh', alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div style={{paddingBottom: '10px'}}>
          <label className="email" id = 'email-label'>Email: </label>
          <input name = "email" type="email" className="email" id="email"/>
        </div>

        <div style={{padding: '10px'}}>
          <label className="firstname" id = 'firstname-label'>First Name: </label>
          <input name = "firstname" type="text" className="firstname" id="firstname" />
        </div>

        <div style={{padding: '10px'}}>
          <label className="lastname" id = 'lastname-label'>Last Name: </label>
          <input name = "lastname" type="text" className="lastname" id="lastname"/>
        </div>

        <div style={{padding: '10px'}}>
          <label className="username" id = 'username-label'>Username: </label>
          <input name = "username" type="text" className="username" id="username"/>
        </div>

        <div style={{padding: '10px'}}>
          <label className="password" id = 'password-label'>Password: </label>
          <input name = "password" type="password" className="password" id="password"/>
        </div>

        <button id="submitbutton" onClick={SignupClick}>Sign Up</button>
      </div>
      <h4 id = 'login-link' className='login-link'>Already have an account? <a href='./login' style={{textDecoration: 'underline', cursor: 'pointer', color: 'var(--tertiary)'}}>Login Here!</a></h4>
    </div>
  );
}

async function createAccount(username, firstName, lastName, email, password) {
  const response = await fetch('http://localhost:3001/api/v1/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({username, firstName, lastName, email, password }),
    redirect: "follow",
  });

  if(response.status === 500) {
    throw new Error('Server Error');
  }

  if(!response.status === 409) {
    throw new Error('User with that email/username already exists.');
  }

  const data = await response;
  return data;
}

function SignupClick(){
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const username = document.getElementById('username').value;
  const firstName = document.getElementById('firstname').value;
  const lastName = document.getElementById('lastname').value;
  
  const myPromise = new Promise(function(myResolve, myReject) {
    createAccount(username, firstName, lastName, email, password).then((response) => {
      response.json().then((data) => {
        if(data.message != 'Signup successful'){
          throw new Error('Signup Failed');
        }
        
        document.cookie = `auth=${data.jwt}xEnding//; Secure`;
        document.cookie = `authVersion=${data.version}yEnding//; Secure`;
        myResolve("OK");
      });
    }).catch((err) => {
      myReject(err);
    });
  });
  
  myPromise.then(
    function(value) {
      //store token
      window.location.href = '/dashboard';
      console.log('Signup Successful');
    },
    function(error) {
      //pop up a red banner warning of a failed login
      //stay on login page
      console.log('Signup Failed: ' + error);
    }
  );
}

export default Signup;