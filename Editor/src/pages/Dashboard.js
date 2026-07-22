import './css/Dashboard.css';
import { RenderPDFEditor } from './components/pdf.js';

function Dashboard() {
  //console.log(renderPDFEditor());

  return (
    <div className="dashboard" width = "100%" height = "100%" top = "0" left = "0">
      <RenderPDFEditor/>
    </div>
  );
}

export default Dashboard;