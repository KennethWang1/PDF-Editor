import "./Common.css";
import { Link } from "react-router";

function Header() {
return (
    <header className="header" id="header">
        <h4 className='title' id = 'title'><a className='title' href='./'>ResuMade</a></h4>
        <div className='divider' id = 'divider'/>
        <h4><a href='./'>Home</a></h4>
        <h4><a href='./about-us'>About Us</a></h4>
        <h4><a href='./pricing'>Pricing</a></h4>
        <h4></h4>
        <Link id = "login" className='login' to = './login'>Login</Link>
        <Link id = "signup" className='signup' to = './signup'>Sign Up</Link>
    </header>
);
}

function Footer() {
    return (
        <footer className="footer" id="footer">
            <h6><a href='./contact-us'>Contact Us</a></h6>
            <h6><a href='./privacy-policy'>Privacy Policy</a></h6>
            <h6><a href='./help'>Help</a></h6>
        </footer>
    );
}

export {Header, Footer};