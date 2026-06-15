import './css/Home.css';
import { Link } from "react-router";
import { Header, Footer } from './components/Common.js';
/*
function Home() {
  return (
    <div>
      <Header />
      <div className="home-body" id="home-body">
        <div className="home-content">
          <h1 className="resume-title" id="resume-title">Job Search Taking Too Long?</h1>
          <h2 className="resume-subtitle" id="resume-subtitle">Save hours of time customizing your resume, try ResuMade!</h2>
          <Link to='./signup' className='start-now' id='start-now'>Start Now!</Link>
          <h2>Home Page Renovations Coming Soon!</h2>
          <img className="home-image" id="home-image" src="./sources/HomeImage.png" alt="home-image"/>
        </div>
      </div>
      <Footer />
    </div>
  );
}
*/

function FirstBlock() {
  return (
    <div style={{backgroundColor: 'var(--hue2)', width: '100%', height: '50vw'}}>
      <div style={{position: 'relative',display: 'flex' , top: '10px', left: '10px', width: 'calc(100% - 20px)', height: 'calc(50vw - 20px)', backgroundColor: 'var(--primary1)', borderRadius: '20px'}}>
        <div style={{position: 'relative', display: 'flex', top: '0', left: 'calc(100% - 250px)', width: '250px', height: '60px', backgroundColor: 'var(--hue2)', borderRadius: '0 0 0 10px', clipPath: 'polygon(calc(100%  - 250px) 0, 100% 0, 100% 60px, calc(100% - 230px) 60px)'}}>
          <Link to={'login'} className='home-title-items' style={{paddingLeft:'50px', marginTop:'7px'}}>Login</Link>
          <Link to={'signup'} className='home-title-items' style={{marginTop:'7px'}}>Sign Up</Link>
        </div>

        <div style={{position: 'absolute', top: '10px', left: '10px', fontSize: '40px', paddingLeft:'10px'}}>ResuMade</div>
        <div id = 'top-bar' className='top-bar'>
          <Link to={'/'} className='home-title-items'>Home</Link>
          <Link to={'/about-us'} className='home-title-items'>About Us</Link>
        </div>
      </div>

      <img id='home-stock' className='home-stock' src='home-stock.png'/>
      <div style={{top:'calc(75px - 50vw);'}}>Save hours of the job search process.</div>
      <h2>Try ResuMade! </h2>
      <Link to = 'sign-up'>Sign Up Today!</Link>

    </div>
  );
}

function Home() {
  return (
    <div>
      <FirstBlock />
    </div>
  );
}

export default Home;