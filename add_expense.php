<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}

$conn = new mysqli(
    $_ENV['MYSQLHOST'],
    $_ENV['MYSQLUSER'],
    $_ENV['MYSQLPASSWORD'],
    $_ENV['MYSQLDATABASE'],
    $_ENV['MYSQLPORT']
);
$uid = $_SESSION['user_id'];

/* CATEGORY ICONS */
$icons = [
    "Food" => "🍔",
    "Travel" => "✈️",
    "Shopping" => "🛍️",
    "Bills" => "💡"
];

/* DELETE */
if(isset($_GET['delete'])){
    $id = (int)$_GET['delete'];
    $conn->query("DELETE FROM expenses WHERE expense_id=$id AND user_id=$uid");
    header("Location: add_expense.php");
    exit();
}

/* EDIT LOAD */
$editData = null;
if(isset($_GET['edit'])){
    $id = (int)$_GET['edit'];
    $editData = $conn->query("SELECT * FROM expenses WHERE expense_id=$id AND user_id=$uid")->fetch_assoc();
}

/* SAVE */
if(isset($_POST['amount'])){
    $cat = $_POST['category'];
    $amt = $_POST['amount'];
    $date = $_POST['date'];
    $desc = $_POST['description'];

    if(isset($_POST['expense_id'])){
        $id = $_POST['expense_id'];
        $stmt = $conn->prepare("UPDATE expenses SET category_id=?, amount=?, expense_date=?, description=? WHERE expense_id=? AND user_id=?");
        $stmt->bind_param("idssii",$cat,$amt,$date,$desc,$id,$uid);
    } else {
        $stmt = $conn->prepare("INSERT INTO expenses(user_id,category_id,amount,expense_date,description) VALUES(?,?,?,?,?)");
        $stmt->bind_param("iidss",$uid,$cat,$amt,$date,$desc);
    }
    $stmt->execute();
    header("Location: add_expense.php");
    exit();
}

/* FILTER + SEARCH */
$where = "WHERE e.user_id=$uid";
if(!empty($_GET['filter'])){
    $filter = $conn->real_escape_string($_GET['filter']);
    $where .= " AND c.category_name='$filter'";
}
if(!empty($_GET['search'])){
    $search = $conn->real_escape_string($_GET['search']);
    $where .= " AND e.description LIKE '%$search%'";
}

/* PAGINATION */
$limit = 5;
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$offset = ($page - 1) * $limit;

$totalRows = $conn->query("
SELECT COUNT(*) AS total
FROM expenses e
JOIN categories c ON e.category_id=c.category_id
$where
")->fetch_assoc()['total'];

$totalPages = ceil($totalRows / $limit);

/* FETCH */
$expenses = $conn->query("
SELECT e.*, c.category_name
FROM expenses e
JOIN categories c ON e.category_id=c.category_id
$where
ORDER BY expense_date DESC
LIMIT $limit OFFSET $offset
");

/* TOTAL SUMMARY */
$totalSummary = $conn->query("
SELECT SUM(e.amount) AS total
FROM expenses e
JOIN categories c ON e.category_id=c.category_id
$where
")->fetch_assoc()['total'] ?? 0;
?>

<!DOCTYPE html>
<html>
<head>
<title>Add Expense</title>
<style>
body{
margin:0;
font-family:Segoe UI;
background:linear-gradient(-45deg,#1e3c72,#2a5298,#4e73df,#36b9cc);
background-size:400% 400%;
animation:gradientMove 12s ease infinite;
color:white;
}
@keyframes gradientMove{
0%{background-position:0% 50%}
50%{background-position:100% 50%}
100%{background-position:0% 50%}
}

.container{
width:95%;
max-width:1000px;
margin:40px auto;
}

.card{
background:rgba(255,255,255,0.15);
backdrop-filter:blur(10px);
padding:25px;
border-radius:15px;
box-shadow:0 8px 25px rgba(0,0,0,0.3);
margin-bottom:30px;
}

input, select{
padding:8px;
border-radius:6px;
border:none;
margin:5px 5px 10px 0;
}

button{
padding:8px 15px;
border:none;
border-radius:6px;
cursor:pointer;
}

.btn-primary{background:#4e73df;color:white;}
.btn-edit{background:#f6c23e;color:black;}
.btn-delete{background:#e74a3b;color:white;}
.btn-back{background:#1cc88a;color:white;}

table{
width:100%;
border-collapse:collapse;
background:white;
color:black;
border-radius:10px;
overflow:hidden;
}

th, td{
padding:10px;
text-align:center;
}

th{
background:#4e73df;
color:white;
}

tr:nth-child(even){
background:#f2f2f2;
}

.pagination a{
color:white;
padding:6px 12px;
margin:3px;
text-decoration:none;
background:rgba(255,255,255,0.2);
border-radius:6px;
}
</style>
</head>

<body>

<div class="container">

<button class="btn-back" onclick="window.location.href='dashboard.php'">
⬅ Back to Dashboard
</button>

<!-- ADD FORM -->
<div class="card">
<h2><?php echo $editData ? "Edit Expense" : "Add Expense"; ?></h2>
<form method="post">

<?php if($editData): ?>
<input type="hidden" name="expense_id" value="<?php echo $editData['expense_id']; ?>">
<?php endif; ?>

<select name="category" required>
<option value="">Select Category</option>
<?php
$r=$conn->query("SELECT * FROM categories");
while($row=$r->fetch_assoc()){
$selected = ($editData && $editData['category_id']==$row['category_id']) ? "selected" : "";
echo "<option value='".$row['category_id']."' $selected>".$row['category_name']."</option>";
}
?>
</select>

<input type="number" name="amount" placeholder="Amount"
value="<?php echo $editData['amount'] ?? ''; ?>" required>

<input type="date" name="date"
value="<?php echo $editData['expense_date'] ?? date('Y-m-d'); ?>" required>

<input type="text" name="description" placeholder="Description"
value="<?php echo $editData['description'] ?? ''; ?>">

<button type="submit" class="btn-primary">
<?php echo $editData ? "Update Expense" : "Add Expense"; ?>
</button>

</form>
</div>

<!-- FILTER -->
<div class="card">
<form method="get">
<select name="filter">
<option value="">All Categories</option>
<?php
$r=$conn->query("SELECT * FROM categories");
while($row=$r->fetch_assoc()){
$selected = (isset($_GET['filter']) && $_GET['filter']==$row['category_name']) ? "selected" : "";
echo "<option value='".$row['category_name']."' $selected>".$row['category_name']."</option>";
}
?>
</select>

<input type="text" name="search" placeholder="Search description"
value="<?php echo $_GET['search'] ?? ''; ?>">

<button type="submit">Apply</button>
</form>
</div>

<!-- TABLE -->
<div class="card">
<table>
<tr>
<th>Date</th>
<th>Category</th>
<th>Amount</th>
<th>Description</th>
<th>Action</th>
</tr>

<?php while($row=$expenses->fetch_assoc()): ?>
<tr>
<td><?php echo $row['expense_date']; ?></td>
<td><?php echo ($icons[$row['category_name']] ?? "📁") . " " . $row['category_name']; ?></td>
<td>₹ <?php echo number_format($row['amount']); ?></td>
<td><?php echo $row['description']; ?></td>
<td>
<a href="?edit=<?php echo $row['expense_id']; ?>" class="btn-edit">Edit</a>
<a href="?delete=<?php echo $row['expense_id']; ?>" class="btn-delete"
onclick="return confirm('Delete this expense?')">Delete</a>
</td>
</tr>
<?php endwhile; ?>
</table>

<div class="pagination">
<?php
for($i=1;$i<=$totalPages;$i++){
echo "<a href='?page=$i'>$i</a>";
}
?>
</div>
</div>

<!-- TOTAL -->
<div class="card">
<h3>Total (Current View): ₹ <?php echo number_format($totalSummary); ?></h3>
</div>

</div>
</body>
</html>
