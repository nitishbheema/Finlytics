<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}
require_once "config.php";

$message     = "";
$messageType = "";

/* ADD CATEGORY */
if(isset($_POST['new_category'])){
    $name = trim($_POST['new_category']);
    if($name !== ""){
        $stmt = $conn->prepare("INSERT INTO categories(category_name) VALUES(?)");
        $stmt->bind_param("s", $name);
        $stmt->execute();
        $message     = "Category '".htmlspecialchars($name)."' added.";
        $messageType = "success";
    }
}

/* UPDATE CATEGORY */
if(isset($_POST['edit_id'])){
    $id   = (int)$_POST['edit_id'];
    $name = trim($_POST['edit_name']);
    if($name !== ""){
        $stmt = $conn->prepare("UPDATE categories SET category_name=? WHERE category_id=?");
        $stmt->bind_param("si", $name, $id);
        $stmt->execute();
        $message     = "Category updated.";
        $messageType = "success";
    }
}

/* DELETE CATEGORY */
if(isset($_GET['delete'])){
    $id    = (int)$_GET['delete'];
    $check = $conn->query("
        SELECT COUNT(*) AS total FROM transactions WHERE category_id=$id
    ")->fetch_assoc();

    if($check['total'] > 0){
        $message     = "⚠ Cannot delete: this category is used in existing transactions.";
        $messageType = "danger";
    } else {
        $conn->query("DELETE FROM categories WHERE category_id=$id");
        $message     = "🗑 Category deleted.";
        $messageType = "success";
    }
}

$categories = $conn->query("SELECT * FROM categories ORDER BY category_name");
$totalCats  = $categories->num_rows;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Manage Categories — Finlytics</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<?php include 'sidebar.php'; ?>

<div class="main">

    <div class="page-header">
        <h2>Manage Categories</h2>
        <a href="dashboard.php" class="btn-back">⬅ Dashboard</a>
    </div>

    <?php if($message): ?>
        <div class="alert alert-<?php echo $messageType; ?>"><?php echo $message; ?></div>
    <?php endif; ?>

    <!-- ADD NEW CATEGORY -->
    <div class="form-card">
        <h3>Add New Category</h3>
        <form method="post">
            <div class="form-row">
                <div>
                    <label>Category Name</label>
                    <input type="text" name="new_category" placeholder="e.g. Entertainment" required>
                </div>
                <div style="display:flex; align-items:flex-end;">
                    <button type="submit" class="btn btn-primary" style="margin:0; width:auto; padding:10px 24px;">
                        ➕ Add Category
                    </button>
                </div>
            </div>
        </form>
    </div>

    <!-- EXISTING CATEGORIES -->
    <div class="section-card">
        <h3>All Categories
            <span style="font-size:13px; color:var(--text-muted); font-weight:400; margin-left:6px;">
                (<?php echo $totalCats; ?> total)
            </span>
        </h3>

        <div style="overflow-x:auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="text-align:left; width:70%;">Category Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                <?php if($totalCats === 0): ?>
                    <tr>
                        <td colspan="2" style="padding:28px; color:var(--text-muted);">
                            No categories yet. Add one above!
                        </td>
                    </tr>
                <?php endif; ?>
                <?php while($row = $categories->fetch_assoc()): ?>
                <tr>
                    <td style="text-align:left;">
                        <form method="post" style="display:flex; align-items:center; gap:8px;">
                            <input type="hidden" name="edit_id" value="<?php echo $row['category_id']; ?>">
                            <input type="text" name="edit_name"
                                value="<?php echo htmlspecialchars($row['category_name']); ?>"
                                required style="max-width:280px; margin:0;">
                            <button type="submit" class="btn btn-sm btn-success" style="white-space:nowrap;">
                                Update
                            </button>
                        </form>
                    </td>
                    <td>
                        <a href="?delete=<?php echo $row['category_id']; ?>"
                           class="btn btn-sm btn-delete"
                           onclick="return confirm('Delete category: <?php echo htmlspecialchars($row['category_name']); ?>?')">
                           Delete
                        </a>
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
</script>

</body>
</html>