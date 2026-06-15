import './css/Dashboard.css';
import { RenderPDFEditor } from './components/pdf.js';

function Dashboard() {
  if (document.cookie.includes('auth=') && document.cookie.includes('authVersion=')) {
    checkToken(document.cookie.split('auth=')[1].split('xEnding//;')[0], document.cookie.split('authVersion=')[1].split('yEnding//;')[0]).then((response) => {
      if (!response) {
        window.location.href = './login';
      }
    });
  } else {
    window.location.href = './login';
  }

  //console.log(renderPDFEditor());

  return (
    <div className="dashboard">
      <RenderPDFEditor/>
    </div>
  );
}

function logout() {
  document.cookie = 'auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  document.cookie = 'authVersion=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  document.cookie = 'refreshToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  window.location.href = './login';
}

async function checkT(t, v) {
  const response = await fetch(window.location.origin + '/api/v1/checkToken', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${[t, v]}`,
    },
    redirect: "follow",
  });
  const data = await response;
  if (data.ok) {
    return data;
  }
  return false;
}

function checkToken(t, v) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await checkT(t, v);
      if (response) {
        resolve("OK");
        const data = await response.json();
        document.cookie = `refreshToken=${data.refreshToken}; Secure`;
      } else {
        reject("Failed");
      }
    } catch (err) {
      reject(err);
    }
  }).then(
    () => true,
    () => {
      window.location.href = './login';
      return false;
    }
  );
}

export default Dashboard;