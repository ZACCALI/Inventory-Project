import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportToPDF(data: any[], columns: { header: string, dataKey: string }[], filename: string, title: string = 'Report', summaryData?: any[]) {
  // Use landscape orientation for reports to prevent column squishing
  const doc = new jsPDF('landscape');
  
  // Premium Truck Icon (replaces 'A' monogram)
  const tx = 14;
  const ty = 14;
  
  try {
    const imgData = await new Promise<string>((resolve, reject) => {
      const img = new window.Image();
      img.src = '/icon.svg';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, 512, 512);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
    });
    doc.addImage(imgData, 'PNG', tx, ty, 9, 9);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // Fallback if image fails to load
    doc.setFillColor(41, 107, 255);
    doc.roundedRect(tx, ty, 9, 9, 2, 2, 'F');
  }
  
  // Fetch dynamic company name from settings
  let companyName = 'Amroding General Merchandise';
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const settings = await res.json();
      if (settings.companyName) {
        companyName = settings.companyName;
      }
    }
  } catch (error) {
    console.error('Failed to fetch company name for PDF:', error);
  }

  // Brand name / System name
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0); // Black text for Brand
  doc.text(companyName, 28, 22);
  
  // Add specific report title
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text(title, 14, 34);
  
  // Date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 40);
  
  // Premium Divider Line
  doc.setDrawColor(220, 225, 235);
  doc.setLineWidth(0.5);
  const pageWidth = doc.internal.pageSize.width;
  doc.line(14, 44, pageWidth - 14, 44);

  // Add table with premium grid styling
  autoTable(doc, {
    startY: 50,
    head: [columns.map(col => col.header)],
    body: data.map(row => columns.map(col => {
      let val = row[col.dataKey];
      if (typeof val === 'string') {
        // Fix jsPDF encoding issue with Peso sign by using PHP
        val = val.replace(/₱/g, 'PHP ');
      }
      return val ?? '';
    })),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4, textColor: [40, 40, 40] },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  if (summaryData && summaryData.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || 50;
    const summaryHeight = 15 + summaryData.length * 8;
    let summaryStartY = finalY + 10;
    
    if (summaryStartY + summaryHeight > 190) {
      doc.addPage();
      summaryStartY = 25;
    }

    autoTable(doc, {
      startY: summaryStartY,
      head: [['Summary Metric', 'Value']],
      body: summaryData.map(row => [row.metric, row.value.replace(/₱/g, 'PHP ')]),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 5, textColor: [40, 40, 40] },
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 80 },
      }
    });
  }

  doc.save(`${filename}.pdf`);
}
