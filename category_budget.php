<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}
require_once "config.php";
$uid = $_SESSION['user_id'];

$saveMsg = "";

/* SAVE BUDGET */
if(isset($_POST['category'])){
    $cat    = $_POST['category'];
    $budget = $_POST['budget'];

    $stmt = $conn->prepare("
        INSERT INTO category_budgets(user_id,category_id,budget)
        VALUES(?,?,?)
        ON DUPLICATE KEY UPDATE budget=VALUES(budget)
    ");
    $stmt->bind_param("iid", $uid, $cat, $budget);
    $stmt->execute();
    $saveMsg = "✅ Budget saved successfully!";
}

/* FETCH ALL WITH SPENT */
$data = $conn->query("
    SELECT
        c.category_id,
        c.category_name,
        IFNULL(cb.budget, 0) AS budget,
        IFNULL(SUM(e.amount), 0) AS spent
    FROM categories c
    LEFT JOIN category_budgets cb ON c.category_id = cb.category_id AND cb.user_id = $uid
    LEFT JOIN expenses e ON e.category_id = c.category_id AND e.user_id = $uid
    GROUP BY c.category_id
    ORDER BY c.category_name
");
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Category Budgets — Finlytics</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<?php include 'sidebar.php'; ?>

<div class="main">

    <div class="page-header">
        <h2>Category Budgets</h2>
        <a href="dashboard.php" class="btn-back">⬅ Dashboard</a>
    </div>

    <?php if($saveMsg): ?>
        <div class="alert alert-success"><?php echo $saveMsg; ?></div>
    <?php endif; ?>

    <!-- SET BUDGET FORM -->
    <div class="form-card">
        <h3>Set a Category Budget</h3>
        <form method="post">
            <div class="form-row">
                <div>
                    <label>Category</label>
                    <select name="category" required>
                        <option value="">Select Category</option>
                        <?php
                        $r = $conn->query("SELECT * FROM categories ORDER BY category_name");
                        while($row = $r->fetch_assoc()){
                            echo "<option value='".$row['category_id']."'>".$row['category_name']."</option>";
                        }
                        ?>
                    </select>
                </div>
                <div>
                    <label>Budget Amount (₹)</label>
                    <input type="number" name="budget" placeholder="e.g. 5000" required>
                </div>
            </div>
            <button type="submit" class="btn btn-primary">Save Budget</button>
        </form>
    </div>

    <!-- BUDGET STATUS TABLE -->
    <div class="section-card">
        <h3>Budget Overview</h3>
        <div style="overflow-x:auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Budget</th>
                        <th>Spent</th>
                        <th>Remaining</th>
                        <th>Usage</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                <?php
                $data->data_seek(0);
                while($row = $data->fetch_assoc()):
                    $budget  = $row['budget'];
                    $spent   = $row['spent'];
                    $remaining = max($budget - $spent, 0);
                    $pct = $budget > 0 ? min(100, round(($spent / $budget) * 100)) : 0;
                    $color = $pct >= 100 ? '#e74c3c' : ($pct >= 75 ? '#f59e0b' : '#27ae60');
                ?>
                <tr>
                    <td style="text-align:left; font-weight:500;"><?php echo $row['category_name']; ?></td>
                    <td>₹<?php echo number_format($budget); ?></td>
                    <td>₹<?php echo number_format($spent); ?></td>
                    <td>
                        <?php if($budget > 0): ?>
                            <span style="color:<?php echo $remaining > 0 ? 'var(--success)' : 'var(--danger)'; ?>; font-weight:600;">
                                ₹<?php echo number_format($remaining); ?>
                            </span>
                        <?php else: ?>
                            <span style="color:var(--text-muted);">—</span>
                        <?php endif; ?>
                    </td>
                    <td style="min-width:120px;">
                        <?php if($budget > 0): ?>
                        <div class="progress" style="height:8px; margin:0;">
                            <div class="progress-bar" style="width:<?php echo $pct; ?>%; background:<?php echo $color; ?>;"></div>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:3px;"><?php echo $pct; ?>%</div>
                        <?php else: ?>
                            <span style="color:var(--text-muted); font-size:12px;">Not set</span>
                        <?php endif; ?>
                    </td>
                    <td>
                        <?php
                        if($budget == 0){
                            echo "<span class='text-muted'>No budget</span>";
                        } elseif($pct >= 100){
                            echo "<span class='text-danger'>⚠ Exceeded</span>";
                        } elseif($pct >= 75){
                            echo "<span class='text-warning'>⚡ Near limit</span>";
                        } else {
                            echo "<span class='text-success'>✅ Good</span>";
                        }
                        ?>
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