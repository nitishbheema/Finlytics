<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}

require('fpdf/fpdf.php');

require_once "config.php";

$uid = $_SESSION['user_id'];

$pdf = new FPDF();
$pdf->AddPage();
$pdf->SetFont('Arial','B',14);
$pdf->Cell(190,10,'Expense Report',0,1,'C');

$result = $conn->query("
SELECT e.*, c.category_name 
FROM expenses e 
JOIN categories c ON e.category_id=c.category_id 
WHERE user_id=$uid
");

$pdf->SetFont('Arial','',10);

while($row=$result->fetch_assoc()){
    $line = $row['expense_date']." | ".$row['category_name']." | ".$row['amount']." | ".$row['description'];
    $pdf->Cell(190,8,$line,0,1);
}

$pdf->Output();
?>