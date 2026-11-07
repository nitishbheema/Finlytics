<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}
require_once "config.php";
$uid = $_SESSION['user_id'];

$icons = [
    "Food"     => "",
    "Travel"   => "",
    "Shopping" => "",
    "Bills"    => ""
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
    $cat  = $_POST['category'];
    $amt  = $_POST['amount'];
    $date = $_POST['date'];
    $desc = $_POST['description'];

    if(isset($_POST['expense_id'])){
        $id = $_POST['expense_id'];
        $stmt = $conn->prepare("UPDATE expenses SET category_id=?, amount=?, expense_date=?, description=? WHERE expense_id=? AND user_id=?");
        $stmt->bind_param("idssii", $cat, $amt, $date, $desc, $id, $uid);
    } else {
        $stmt = $conn->prepare("INSERT INTO expenses(user_id,category_id,amount,expense_date,description) VALUES(?,?,?,?,?)");
        $stmt->bind_param("iidss", $uid, $cat, $amt, $date, $desc);
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
$limit  = 8;
$page   = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$offset = ($page - 1) * $limit;

$totalRows = $conn->query("
    SELECT COUNT(*) AS total FROM expenses e
    JOIN categories c ON e.category_id=c.category_id $where
")->fetch_assoc()['total'];

$totalPages = ceil($totalRows / $limit);

/* FETCH */
$expenses = $conn->query("
    SELECT e.*, c.category_name FROM expenses e
    JOIN categories c ON e.category_id=c.category_id
    $where ORDER BY expense_date DESC
    LIMIT $limit OFFSET $offset
");

/* TOTAL SUMMARY */
$totalSummary = $conn->query("
    SELECT SUM(e.amount) AS total FROM expenses e
    JOIN categories c ON e.category_id=c.category_id $where
")->fetch_assoc()['total'] ?? 0;

/* Build query string for pagination (preserve filter/search) */
$qParams = [];
if(!empty($_GET['filter']))  $qParams[] = "filter=".urlencode($_GET['filter']);
if(!empty($_GET['search']))  $qParams[] = "search=".urlencode($_GET['search']);
$qBase = count($qParams) ? "?".implode("&", $qParams)."&" : "?";
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Add Expense — Finlytics</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<?php include 'sidebar.php'; ?>

<div class="main">

    <div class="page-header">
        <h2><?php echo $editData ? "✏️ Edit Expense" : "Add Expense"; ?></h2>
        <a href="dashboard.php" class="btn-back">⬅ Dashboard</a>
    </div>

    <!-- ADD / EDIT FORM -->
    <div class="form-card">
        <h3><?php echo $editData ? "Update Expense Entry" : "New Expense Entry"; ?></h3>
        <form method="post">
            <?php if($editData): ?>
                <input type="hidden" name="expense_id" value="<?php echo $editData['expense_id']; ?>">
            <?php endif; ?>

            <div class="form-row">
                <div>
                    <label>Category</label>
                    <select name="category" required>
                        <option value="">Select Category</option>
                        <?php
                        $r = $conn->query("SELECT * FROM categories");
                        while($row = $r->fetch_assoc()){
                            $selected = ($editData && $editData['category_id'] == $row['category_id']) ? "selected" : "";
                            echo "<option value='".$row['category_id']."' $selected>".$row['category_name']."</option>";
                        }
                        ?>
                    </select>
                </div>
                <div>
                    <label>Amount (₹)</label>
                    <input type="number" name="amount" placeholder="e.g. 500"
                        value="<?php echo $editData['amount'] ?? ''; ?>" required>
                </div>
            </div>

            <div class="form-row">
                <div>
                    <label>Date</label>
                    <input type="date" name="date"
                        value="<?php echo $editData['expense_date'] ?? date('Y-m-d'); ?>" required>
                </div>
                <div>
                    <label>Description</label>
                    <input type="text" name="description" placeholder="e.g. Groceries"
                        value="<?php echo $editData['description'] ?? ''; ?>">
                </div>
            </div>

            <button type="submit" class="btn btn-primary">
                <?php echo $editData ? "✅ Update Expense" : "➕ Add Expense"; ?>
            </button>
        </form>
    </div>

    <!-- FILTER BAR -->
    <div class="section-card">
        <h3>Filter Expenses</h3>
        <form method="get">
            <div class="filter-bar">
                <div>
                    <label>Category</label>
                    <select name="filter">
                        <option value="">All Categories</option>
                        <?php
                        $r = $conn->query("SELECT * FROM categories");
                        while($row = $r->fetch_assoc()){
                            $selected = (isset($_GET['filter']) && $_GET['filter'] == $row['category_name']) ? "selected" : "";
                            echo "<option value='".$row['category_name']."' $selected>".$row['category_name']."</option>";
                        }
                        ?>
                    </select>
                </div>
                <div>
                    <label>Search Description</label>
                    <input type="text" name="search" placeholder="Search..."
                        value="<?php echo htmlspecialchars($_GET['search'] ?? ''); ?>">
                </div>
                <div style="display:flex; align-items:flex-end; gap:8px; flex:0;">
                    <button type="submit" class="btn btn-primary" style="margin:0; width:auto; padding:10px 20px;">
                        Apply
                    </button>
                    <?php if(!empty($_GET['filter']) || !empty($_GET['search'])): ?>
                        <a href="add_expense.php" class="btn btn-outline btn-sm" style="padding:10px 16px;">Clear</a>
                    <?php endif; ?>
                </div>
            </div>
        </form>
    </div>

    <!-- EXPENSE TABLE -->
    <div class="section-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
            <h3 style="margin:0;">Expenses
                <span style="font-size:13px; color:var(--text-muted); font-weight:400;">
                    (<?php echo $totalRows; ?> records)
                </span>
            </h3>
            <span style="font-weight:700; color:var(--danger); font-size:16px;">
                Total: ₹<?php echo number_format($totalSummary); ?>
            </span>
        </div>

        <div style="overflow-x:auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                <?php if($expenses->num_rows === 0): ?>
                    <tr>
                        <td colspan="5" style="padding:30px; color:var(--text-muted);">
                            No expenses found.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php while($row = $expenses->fetch_assoc()): ?>
                    <tr>
                        <td><?php echo $row['expense_date']; ?></td>
                        <td><?php echo ($icons[$row['category_name']] ?? "📁") . " " . $row['category_name']; ?></td>
                        <td><strong style="color:var(--danger);">₹<?php echo number_format($row['amount']); ?></strong></td>
                        <td><?php echo $row['description'] ?: '—'; ?></td>
                        <td>
                            <a href="?edit=<?php echo $row['expense_id']; ?>" class="btn btn-sm btn-edit">Edit</a>
                            <a href="?delete=<?php echo $row['expense_id']; ?>"
                               class="btn btn-sm btn-delete"
                               onclick="return confirm('Delete this expense?')"
                               style="margin-left:5px;">Delete</a>
                        </td>
                    </tr>
                <?php endwhile; ?>
                </tbody>
            </table>
        </div>

        <!-- PAGINATION -->
        <?php if($totalPages > 1): ?>
        <div class="pagination">
            <?php for($i = 1; $i <= $totalPages; $i++): ?>
                <a href="<?php echo $qBase; ?>page=<?php echo $i; ?>"
                   class="<?php echo $i == $page ? 'active' : ''; ?>">
                    <?php echo $i; ?>
                </a>
            <?php endfor; ?>
        </div>
        <?php endif; ?>
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
</script>

</body>
</html>