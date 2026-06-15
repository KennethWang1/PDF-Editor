import './App.css';
import Dashboard from './pages/Dashboard.js';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from './pages/Home.js';
import Signup from './pages/Signup.js';
import Login from './pages/Login.js';
import AboutUs from './pages/AboutUs.js';
import Pricing from './pages/Pricing.js';
import ContactUs from './pages/ContactUs.js';

function App() {
  return (  
    <Router>
      <Routes>
        <Route path = "/" element = {<Home/>}/>
        <Route path = "/signup" element = {<Signup/>}/>
        <Route path = "/login" element = {<Login/>}/>
        <Route path = "/about-us" element = {<AboutUs/>}/>
        <Route path = "/pricing" element = {<Pricing/>}/>
        <Route path = "/dashboard" element = {<Dashboard/>}/>
        <Route path = "/contact-us" element = {<ContactUs/>}/>
      </Routes>
    </Router>
  );
}

export default App;
