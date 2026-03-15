<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}
require_once "config.php";
$uid = $_SESSION['user_id'];

/* ================= DELETE ================= */
if(isset($_GET['delete'])){
    $id = (int)$_GET['delete'];
    $conn->query("
        DELETE FROM transactions 
        WHERE transaction_id=$id 
        AND user_id=$uid 
        AND type='income'
    ");
    header("Location: add_income.php");
    exit();
}

/* ================= LOAD FOR EDIT ================= */
$editData = null;
if(isset($_GET['edit'])){
    $id = (int)$_GET['edit'];
    $editData = $conn->query("
        SELECT * FROM transactions 
        WHERE transaction_id=$id 
        AND user_id=$uid 
        AND type='income'
    ")->fetch_assoc();
}

/* ================= SAVE ================= */
if(isset($_POST['amount'])){

    $category = $_POST['category'];

    // Custom category
    if($category === "custom"){
        $newCategory = trim($_POST['custom_category']);

        if(!empty($newCategory)){
            $check = $conn->prepare("SELECT category_id FROM categories WHERE category_name=?");
            $check->bind_param("s",$newCategory);
            $check->execute();
            $result = $check->get_result();

            if($result->num_rows > 0){
                $row = $result->fetch_assoc();
                $category = $row['category_id'];
            } else {
                $insertCat = $conn->prepare("INSERT INTO categories(category_name) VALUES(?)");
                $insertCat->bind_param("s",$newCategory);
                $insertCat->execute();
                $category = $insertCat->insert_id;
            }
        }
    }

    $amount = $_POST['amount'];
    $date = $_POST['date'];
    $desc = $_POST['description'];
    $type = "income";

    if(isset($_POST['transaction_id'])){
        $id = $_POST['transaction_id'];
        $stmt = $conn->prepare("
            UPDATE transactions 
            SET category_id=?, amount=?, description=?, transaction_date=? 
            WHERE transaction_id=? AND user_id=? AND type='income'
        ");
        $stmt->bind_param("idssii",$category,$amount,$desc,$date,$id,$uid);
    } else {
        $stmt = $conn->prepare("
            INSERT INTO transactions(user_id,category_id,amount,type,description,transaction_date) 
            VALUES(?,?,?,?,?,?)
        ");
        $stmt->bind_param("iidsss",$uid,$category,$amount,$type,$desc,$date);
    }

    $stmt->execute();
    header("Location: add_income.php");
    exit();
}
?>
<!DOCTYPE html>
<html>
<head>
<title>Add Income</title>
<style>
body{font-family:Segoe UI;background:#f4f6fb;padding:40px;}
.container{width:500px;margin:auto;background:white;padding:25px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.1);}
input,select,button{width:100%;padding:8px;margin-top:10px;border-radius:6px;}
button{background:#1e3c72;color:white;border:none;cursor:pointer;}
table{width:100%;margin-top:20px;border-collapse:collapse;}
th,td{padding:8px;border:1px solid #ddd;text-align:center;}
th{background:#1e3c72;color:white;}
</style>
</head>
<body>

<div class="container">
<h2><?php echo $editData ? "Edit Income" : "Add Income"; ?></h2>

<form method="post">

<?php if($editData): ?>
<input type="hidden" name="transaction_id" value="<?php echo $editData['transaction_id']; ?>">
<?php endif; ?>

<select name="category" id="category" required onchange="toggleCustom()">
<option value="">Select Category</option>
<?php
$r = $conn->query("SELECT * FROM categories");
while($row=$r->fetch_assoc()){
    $selected = ($editData && $editData['category_id']==$row['category_id']) ? "selected" : "";
    echo "<option value='".$row['category_id']."' $selected>".$row['category_name']."</option>";
}
?>
<option value="custom">Other (Add New)</option>
</select>

<input type="text" name="custom_category" id="custom_category"
placeholder="Enter New Category" style="display:none;">

<input type="number" name="amount" 
value="<?php echo $editData['amount'] ?? ''; ?>" 
placeholder="Amount" required>

<input type="date" name="date" 
value="<?php echo $editData['transaction_date'] ?? date('Y-m-d'); ?>" 
required>

<input type="text" name="description" 
value="<?php echo $editData['description'] ?? ''; ?>" 
placeholder="Description">

<button type="submit">
<?php echo $editData ? "Update Income" : "Add Income"; ?>
</button>

</form>

<hr>
<h3>Recent Incomes</h3>

<table>
<tr>
<th>Date</th>
<th>Category</th>
<th>Description</th>
<th>Amount</th>
<th>Action</th>
</tr>

<?php
$recentIncome = $conn->query("
SELECT t.*, c.category_name 
FROM transactions t
JOIN categories c ON t.category_id=c.category_id
WHERE t.user_id=$uid AND t.type='income'
ORDER BY t.transaction_date DESC
LIMIT 5
");

while($row=$recentIncome->fetch_assoc()):
?>

<tr>
<td><?php echo $row['transaction_date']; ?></td>
<td><?php echo $row['category_name']; ?></td>
<td><?php echo $row['description']; ?></td>
<td>₹<?php echo number_format($row['amount']); ?></td>
<td>
<a href="?edit=<?php echo $row['transaction_id']; ?>">Edit</a> |
<a href="?delete=<?php echo $row['transaction_id']; ?>" 
onclick="return confirm('Delete this income?')">Delete</a>
</td>
</tr>

<?php endwhile; ?>

</table>

<br>
<a href="dashboard.php">⬅ Back to Dashboard</a>

</div>

<script>
function toggleCustom(){
    var cat = document.getElementById("category").value;
    var customInput = document.getElementById("custom_category");

    if(cat === "custom"){
        customInput.style.display = "block";
        customInput.required = true;
    } else {
        customInput.style.display = "none";
        customInput.required = false;
    }
}
</script>

</body>
</html>