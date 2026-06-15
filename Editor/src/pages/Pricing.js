import "./css/Pricing.css";
import {Header, Footer} from './components/Common.js';

function Pricing(){
    return(
        <body>
            <Header/>
            <div className = "body" id = "body">
                <h2 className = "resume-title" id = "resume-title">Pricing</h2>
                <table>
                    <tr>
                        <th>Tier: </th>
                        <th scope = 'col'>   Free   </th>
                        <th scop = 'col'>Premium</th>
                    </tr>
                    <tr>
                        <td>Tables</td>
                        <td>2</td>
                        <td>10</td>
                    </tr>
                    <tr>
                        <td>Cell Count</td>
                        <td>10</td>
                        <td>20</td>
                    </tr>
                    <tr>
                        <td>Ads</td>
                        <td>yes</td>
                        <td>no</td>
                    </tr>
                    <tr>
                        <td>Resume Templates</td>
                        <td>yes</td>
                        <td>yes</td>
                    </tr>
                    <tr>
                        <td>Resume Builder</td>
                        <td>yes</td>
                        <td>yes</td>
                    </tr>
                    <tr>
                        <td>Tutorials</td>
                        <td>no</td>
                        <td>yes</td>
                    </tr>
                    <tr>
                        <td>Cost</td>
                        <td>free</td>
                        <td>$10/month</td>
                    </tr>
                </table>
            </div>
            <Footer/>
        </body>
    );
}

export default Pricing;