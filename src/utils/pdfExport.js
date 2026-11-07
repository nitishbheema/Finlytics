import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportExpensesToPDF(expenses, user, totalAmount) {
  const doc = new jsPDF();

  // Primary Theme Color (#cc7a3e)
  doc.setFillColor(204, 122, 62);
  doc.rect(0, 0, 210, 24, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Finlytics - Expense Report', 14, 15);

  // Subtitle / User metadata
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated for: ${user?.name || 'User'} (${user?.email || ''})`, 14, 32);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, 14, 38);
  doc.text(`Total Expenses: Rs. ${Number(totalAmount || 0).toLocaleString('en-IN')}`, 14, 44);

  // Table Data
  const tableRows = expenses.map(item => [
    item.expense_date,
    item.category_name || 'Uncategorized',
    `Rs. ${Number(item.amount).toLocaleString('en-IN')}`,
    item.description || '—'
  ]);

  autoTable(doc, {
    startY: 50,
    head: [['Date', 'Category', 'Amount', 'Description']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [204, 122, 62],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    styles: {
      fontSize: 9,
      cellPadding: 3.5,
      textColor: [40, 40, 40],
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 40 },
      2: { cellWidth: 35, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount} — Finlytics Modern Finance Tracker`,
        14,
        doc.internal.pageSize.height - 10
      );
    }
  });

  const filename = `Finlytics-Expense-Report-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
