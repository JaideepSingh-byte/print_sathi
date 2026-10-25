/**
 * Utility script to generate a sample 5-page PDF for testing Print-Sathi immediately!
 */
import fs from 'fs';
import path from 'path';

function createSamplePdf() {
  const dir = path.resolve('sample_documents');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Minimal standard PDF 1.4 syntax with 5 pages
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R] /Count 5 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
5 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
7 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000142 00000 n 
0000000213 00000 n 
0000000284 00000 n 
0000000355 00000 n 
0000000426 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
497
%%EOF`;

  const filePath = path.join(dir, 'Sample_Lecture_Notes_5_Pages.pdf');
  fs.writeFileSync(filePath, content);
  console.log('Sample PDF created at:', filePath);
}

createSamplePdf();
