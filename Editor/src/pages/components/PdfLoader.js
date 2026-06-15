import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

function PdfUploader() {
  const [file, setFile] = useState(null);

  const onFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  return (
    <div>
      <input type="file" accept="application/pdf" onChange={onFileChange} />
      {file && (
        <Document file={file}> 
          <Page pageNumber={1} />
        </Document>
      )}
    </div>
  );
}

export async function downloadPdf(url, filename = 'download.pdf') {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/pdf',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to download PDF');
  }
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export { PdfUploader, downloadPdf };
