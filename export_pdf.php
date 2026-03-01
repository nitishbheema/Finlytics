<?php
session_start();
require('fpdf/fpdf.php');

<<<<<<< HEAD
$conn = new mysqli("localhost","root","","trackwise");
=======
$host = "yamabiko.proxy.rlwy.net";
$user = "root";
$password = "FUVTxyveCjKHaUUpSElYSrzgWWPEyokT";
$database = "railway";
$port = 15951;

$conn = new mysqli(
    getenv("MYSQLHOST"),
    getenv("MYSQLUSER"),
    getenv("MYSQLPASSWORD"),
    getenv("MYSQLDATABASE"),
    getenv("MYSQLPORT")
);

if ($conn->connect_error) {
    die("Database Connection Failed: " . $conn->connect_error);
}
>>>>>>> 9b882ed74f9466c70673c856716a8dfa26f3f5c6
$uid = $_SESSION['user_id'];

$pdf = new FPDF();
$pdf->AddPage();
$pdf->SetFont('Arial','B',14);
$pdf->Cell(190,10,'Expense Report',0,1,'C');

$result = $conn->query("SELECT e.*, c.category_name FROM expenses e JOIN categories c ON e.category_id=c.category_id WHERE user_id=$uid");

$pdf->SetFont('Arial','',10);

while($row=$result->fetch_assoc()){
    $line = $row['expense_date']." | ".$row['category_name']." | ".$row['amount']." | ".$row['description'];
    $pdf->Cell(190,8,$line,0,1);
}

$pdf->Output();
<<<<<<< HEAD
?>
=======
?>
>>>>>>> 9b882ed74f9466c70673c856716a8dfa26f3f5c6
