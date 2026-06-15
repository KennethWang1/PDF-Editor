import "./css/AboutUs.css";
import {Header, Footer} from './components/Common.js';

function AboutUs(){
    return(
        <body>
            <Header/>
                <div className="body" id="body">
                    <h2>Helping you get your dream job.</h2>
                    <div id="line" className="line"/>
                    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                        <div id = "left" className="left">
                            <h3>Who are we?</h3>
                            <p>We are a team of people who believe everyone should be able to find their dream job.</p>
                            <h3>What do we do?</h3>
                            <p>We help tailor your resume to fit your job requirements using our advanced AI. Thus, you can focus on more important parts of the job search.</p>
                        </div>
                        <div id = "right" className="right">
                            <h3>Our goals</h3>
                            <p>
                            We aim to establish ourselves as a readily available platform for job seekers.
                            </p>
                            
                            <h3>Our values</h3>
                            <p>
                                Our 3 main values are:<br/>
                                1. Customer satisfaction and experience<br/>
                                2. Quality of our service<br/>
                                3. The wellbeing of our employees and customers<br/>
                            </p>
                        </div>
                    </div>

                    <Footer/>
                </div>
        </body>
    );
}

export default AboutUs;