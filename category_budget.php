<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}

require_once "config.php";
$uid = $_SESSION['user_id'];

/* SAVE BUDGET */
if(isset($_POST['category'])){
    $cat = $_POST['category'];
    $budget = $_POST['budget'];

    $stmt = $conn->prepare("
    INSERT INTO category_budgets(user_id,category_id,budget)
    VALUES(?,?,?)
    ON DUPLICATE KEY UPDATE budget=VALUES(budget)
    ");
    $stmt->bind_param("iid",$uid,$cat,$budget);
    $stmt->execute();
}

/* FETCH ALL */
$data = $conn->query("
SELECT c.category_name, cb.budget, c.category_id
FROM categories c
LEFT JOIN category_budgets cb 
ON c.category_id = cb.category_id AND cb.user_id = $uid
");
?>
<!DOCTYPE html>
<html>
<head>
<title>Category Budgets</title>
<style>
body{font-family:Segoe UI;background:#f4f6fb;padding:40px;}
.container{max-width:600px;margin:auto;background:white;padding:25px;border-radius:12px;}
input,select,button{width:100%;padding:8px;margin-top:10px;}
button{background:#1e3c72;color:white;border:none;}
table{width:100%;margin-top:20px;border-collapse:collapse;}
th,td{padding:8px;text-align:center;border-bottom:1px solid #ddd;}
</style>
</head>
<body>

<div class="container">
<h2>Set Category Budgets</h2>

<form method="post">
<select name="category" required>
<option value="">Select Category</option>
<?php
$r=$conn->query("SELECT * FROM categories");
while($row=$r->fetch_assoc()){
echo "<option value='".$row['category_id']."'>".$row['category_name']."</option>";
}
?>
</select>

<input type="number" name="budget" placeholder="Enter Budget Amount" required>
<button type="submit">Save Budget</button>
</form>

<h3>Existing Budgets</h3>
<table>
<tr>
<th>Category</th>
<th>Budget</th>
</tr>

<?php while($row=$data->fetch_assoc()): ?>
<tr>
<td><?php echo $row['category_name']; ?></td>
<td>₹ <?php echo $row['budget'] ?? 0; ?></td>
</tr>
<?php endwhile; ?>
</table>

<br>
<a href="dashboard.php">⬅ Back</a>

</div>
</body>
</html>