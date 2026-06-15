import "./css/ContactUs.css";
import {Header, Footer} from './components/Common.js';

function ContactUs() {
    return (
        <body>
            <Header/>
            <div className = "body" id = "body">
                <h2 className = "resume-title" id = "resume-title">Contact Us</h2>
                <a href = "mailto:ResuMade@gmail.com">Email: ResuMade@gmail.com</a>
                <p>Phone Number: (123) 456-789 (example)</p>
            </div>
            <Footer/>
        </body>
    );
}

export default ContactUs;