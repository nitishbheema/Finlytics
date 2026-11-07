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
    $conn->query("DELETE FROM transactions WHERE transaction_id=$id AND user_id=$uid AND type='income'");
    header("Location: add_income.php");
    exit();
}

/* ================= LOAD FOR EDIT ================= */
$editData = null;
if(isset($_GET['edit'])){
    $id = (int)$_GET['edit'];
    $editData = $conn->query("
        SELECT * FROM transactions WHERE transaction_id=$id AND user_id=$uid AND type='income'
    ")->fetch_assoc();
}

/* ================= SAVE ================= */
$saveMsg = "";
if(isset($_POST['amount'])){
    $category = $_POST['category'];

    if($category === "custom"){
        $newCategory = trim($_POST['custom_category']);
        if(!empty($newCategory)){
            $check = $conn->prepare("SELECT category_id FROM categories WHERE category_name=?");
            $check->bind_param("s", $newCategory);
            $check->execute();
            $result = $check->get_result();
            if($result->num_rows > 0){
                $row = $result->fetch_assoc();
                $category = $row['category_id'];
            } else {
                $insertCat = $conn->prepare("INSERT INTO categories(category_name) VALUES(?)");
                $insertCat->bind_param("s", $newCategory);
                $insertCat->execute();
                $category = $insertCat->insert_id;
            }
        }
    }

    $amount = $_POST['amount'];
    $date   = $_POST['date'];
    $desc   = $_POST['description'];
    $type   = "income";

    if(isset($_POST['transaction_id'])){
        $id = $_POST['transaction_id'];
        $stmt = $conn->prepare("
            UPDATE transactions SET category_id=?, amount=?, description=?, transaction_date=?
            WHERE transaction_id=? AND user_id=? AND type='income'
        ");
        $stmt->bind_param("idssii", $category, $amount, $desc, $date, $id, $uid);
    } else {
        $stmt = $conn->prepare("
            INSERT INTO transactions(user_id,category_id,amount,type,description,transaction_date)
            VALUES(?,?,?,?,?,?)
        ");
        $stmt->bind_param("iidsss", $uid, $category, $amount, $type, $desc, $date);
    }
    $stmt->execute();
    header("Location: add_income.php");
    exit();
}

/* ================= RECENT INCOMES ================= */
$recentIncome = $conn->query("
    SELECT t.*, c.category_name
    FROM transactions t
    JOIN categories c ON t.category_id=c.category_id
    WHERE t.user_id=$uid AND t.type='income'
    ORDER BY t.transaction_date DESC
    LIMIT 10
");

$totalIncome = $conn->query("
    SELECT SUM(amount) t FROM transactions WHERE user_id=$uid AND type='income'
")->fetch_assoc()['t'] ?? 0;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Add Income — Finlytics</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<?php include 'sidebar.php'; ?>

<div class="main">

    <div class="page-header">
        <h2><?php echo $editData ? "✏️ Edit Income" : "Add Income"; ?></h2>
        <a href="dashboard.php" class="btn-back">⬅ Dashboard</a>
    </div>

    <!-- FORM -->
    <div class="form-card">
        <h3><?php echo $editData ? "Update Income Entry" : "New Income Entry"; ?></h3>
        <form method="post">
            <?php if($editData): ?>
                <input type="hidden" name="transaction_id" value="<?php echo $editData['transaction_id']; ?>">
            <?php endif; ?>

            <div class="form-row">
                <div>
                    <label>Category</label>
                    <select name="category" id="category" required onchange="toggleCustom()">
                        <option value="">Select Category</option>
                        <?php
                        $r = $conn->query("SELECT * FROM categories");
                        while($row = $r->fetch_assoc()){
                            $selected = ($editData && $editData['category_id'] == $row['category_id']) ? "selected" : "";
                            echo "<option value='".$row['category_id']."' $selected>".$row['category_name']."</option>";
                        }
                        ?>
                        <option value="custom">➕ Add New Category</option>
                    </select>
                </div>
                <div>
                    <label>Amount (₹)</label>
                    <input type="number" name="amount" placeholder="e.g. 5000"
                        value="<?php echo $editData['amount'] ?? ''; ?>" required>
                </div>
            </div>

            <div id="custom_wrap" style="display:none;">
                <label>New Category Name</label>
                <input type="text" name="custom_category" id="custom_category" placeholder="Enter category name">
            </div>

            <div class="form-row">
                <div>
                    <label>Date</label>
                    <input type="date" name="date"
                        value="<?php echo $editData['transaction_date'] ?? date('Y-m-d'); ?>" required>
                </div>
                <div>
                    <label>Description</label>
                    <input type="text" name="description" placeholder="e.g. Monthly salary"
                        value="<?php echo $editData['description'] ?? ''; ?>">
                </div>
            </div>

            <button type="submit" class="btn btn-primary">
                <?php echo $editData ? "✅ Update Income" : "➕ Add Income"; ?>
            </button>
        </form>
    </div>

    <!-- RECENT TABLE -->
    <div class="section-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0;">Recent Incomes</h3>
            <span style="font-weight:700; color:var(--primary); font-size:16px;">
                Total: ₹<?php echo number_format($totalIncome); ?>
            </span>
        </div>

        <div style="overflow-x:auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                <?php while($row = $recentIncome->fetch_assoc()): ?>
                    <tr>
                        <td><?php echo $row['transaction_date']; ?></td>
                        <td><?php echo $row['category_name']; ?></td>
                        <td><?php echo $row['description'] ?: '—'; ?></td>
                        <td><strong style="color:var(--success);">₹<?php echo number_format($row['amount']); ?></strong></td>
                        <td>
                            <a href="?edit=<?php echo $row['transaction_id']; ?>"
                               class="btn btn-sm btn-edit">Edit</a>
                            <a href="?delete=<?php echo $row['transaction_id']; ?>"
                               class="btn btn-sm btn-delete"
                               onclick="return confirm('Delete this income?')" style="margin-left:5px;">Delete</a>
                        </td>
                    </tr>
                <?php endwhile; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<script>
function toggleDark(){
    document.body.classList.toggle('light');
    var isLight = document.body.classList.contains('light');
    localStorage.setItem('lightMode', isLight);
    var icon  = document.getElementById('themeIcon');
    var label = document.getElementById('themeLabel');
    if(icon)  icon.textContent  = isLight ? '🌙' : '☀️';
    if(label) label.textContent = isLight ? 'Dark Mode' : 'Light Mode';
}
(function(){
    var isLight = localStorage.getItem('lightMode') === 'true';
    if(isLight) document.body.classList.add('light');
    var icon  = document.getElementById('themeIcon');
    var label = document.getElementById('themeLabel');
    if(icon)  icon.textContent  = isLight ? '🌙' : '☀️';
    if(label) label.textContent = isLight ? 'Dark Mode' : 'Light Mode';
})();

function toggleCustom(){
    var val = document.getElementById('category').value;
    var wrap = document.getElementById('custom_wrap');
    var input = document.getElementById('custom_category');
    if(val === 'custom'){
        wrap.style.display = 'block';
        input.required = true;
    } else {
        wrap.style.display = 'none';
        input.required = false;
    }
}
</script>

</body>
</html>