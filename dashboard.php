<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}

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
$uid = $_SESSION['user_id'];

$userData = $conn->query("SELECT name,budget,photo FROM users WHERE user_id=$uid")->fetch_assoc();
$username = $userData['name'];
$budget = $userData['budget'];
$photo = $userData['photo'];

$total = $conn->query("SELECT SUM(amount) t FROM expenses WHERE user_id=$uid")->fetch_assoc()['t'] ?? 0;

/* FIX: define remaining */
$remaining = max($budget - $total, 0);

$catQuery = "
SELECT c.category_name, SUM(e.amount) total
FROM expenses e
JOIN categories c ON e.category_id=c.category_id
WHERE e.user_id=$uid
GROUP BY c.category_name";
$catResult = $conn->query($catQuery);

$categories=[];
$amounts=[];
while($row=$catResult->fetch_assoc()){
    $categories[]=$row['category_name'];
    $amounts[]=$row['total'];
}

$monthQuery="
SELECT MONTH(expense_date) m, SUM(amount) total
FROM expenses
WHERE user_id=$uid
GROUP BY MONTH(expense_date)
ORDER BY m";
$monthResult=$conn->query($monthQuery);

$months=[];
$monthAmounts=[];
while($row=$monthResult->fetch_assoc()){
    $months[]="Month ".$row['m'];
    $monthAmounts[]=$row['total'];
}

$budgetExceeded = $total > $budget;

/* Budget % */
$budgetPercent = $budget > 0 ? min(100, ($total/$budget)*100) : 0;

/* Month Comparison */
$currentMonth = date('m');
$prevMonth = date('m', strtotime('-1 month'));

$currentMonthTotal = $conn->query("
SELECT SUM(amount) t FROM expenses
WHERE user_id=$uid AND MONTH(expense_date)=$currentMonth
")->fetch_assoc()['t'] ?? 0;

$prevMonthTotal = $conn->query("
SELECT SUM(amount) t FROM expenses
WHERE user_id=$uid AND MONTH(expense_date)=$prevMonth
")->fetch_assoc()['t'] ?? 0;

$comparison = ($prevMonthTotal > 0)
    ? (($currentMonthTotal - $prevMonthTotal)/$prevMonthTotal)*100
    : 0;

/* Top Category */
$topCategory = $conn->query("
SELECT c.category_name, SUM(e.amount) total
FROM expenses e
JOIN categories c ON e.category_id=c.category_id
WHERE e.user_id=$uid
GROUP BY c.category_name
ORDER BY total DESC
LIMIT 1
")->fetch_assoc();

/* Financial Score */
$score = 100;
if($budgetPercent > 100) $score -= 40;
if($budgetPercent > 80) $score -= 20;
if($comparison > 20) $score -= 15;
$score = max(0,$score);

/* Recent */
$recent = $conn->query("
SELECT e.amount, e.description, e.expense_date, c.category_name
FROM expenses e
JOIN categories c ON e.category_id=c.category_id
WHERE e.user_id=$uid
ORDER BY expense_date DESC
LIMIT 5
");
?>
<!DOCTYPE html>
<html>
<head>
<title>TrackWise Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
:root{
--bg:#f4f6fb;
--card:#ffffff;
--text:#222;
--primary:#1e3c72;
}

body.dark{
--bg:#1e1e2f;
--card:#2c2c3f;
--text:#fff;
--primary:#4e73df;
}

body{
margin:0;
font-family:Segoe UI;
background:var(--bg);
color:var(--text);
transition:0.3s;
}

.sidebar{
width:220px;
height:100vh;
background:var(--primary);
color:white;
position:fixed;
padding:20px;
}

.sidebar a{
display:block;
color:white;
text-decoration:none;
margin:15px 0;
transition:0.3s;
}

.sidebar a:hover{
opacity:0.7;
transform:translateX(5px);
}

.main{
margin-left:240px;
padding:30px;
}

.topbar{
display:flex;
justify-content:space-between;
align-items:center;
margin-bottom:30px;
}

.header-right{
display:flex;
align-items:center;
gap:20px;
}

.toggle{
cursor:pointer;
padding:8px 12px;
background:var(--card);
border-radius:20px;
box-shadow:0 5px 15px rgba(0,0,0,0.1);
}

.bell{
position:relative;
cursor:pointer;
font-size:20px;
}

.notification-box{
display:none;
position:absolute;
top:35px;
right:0;
background:var(--card);
padding:18px;
width:240px;
border-radius:12px;
box-shadow:0 12px 25px rgba(0,0,0,0.25);
animation:fadeIn 0.3s ease;
}

.notification-box p{
margin:6px 0;
font-size:14px;
}

.bell:hover .notification-box{
display:block;
}

@keyframes fadeIn{
from{opacity:0; transform:translateY(8px);}
to{opacity:1; transform:translateY(0);}
}

.user-info{
position:relative;
cursor:pointer;
}

.user-info img{
width:45px;
height:45px;
border-radius:50%;
object-fit:cover;
border:3px solid var(--primary);
}

.dropdown{
display:none;
position:absolute;
right:0;
top:55px;
background:var(--card);
padding:10px;
border-radius:8px;
box-shadow:0 10px 20px rgba(0,0,0,0.1);
}

.dropdown a{
display:block;
text-decoration:none;
color:var(--text);
padding:8px 12px;
}

.dropdown a:hover{
background:#eee;
}

.user-info:hover .dropdown{
display:block;
}

.card-container{
display:flex;
gap:20px;
margin-bottom:30px;
}

.card{
flex:1;
background:var(--card);
padding:20px;
border-radius:12px;
box-shadow:0 10px 25px rgba(0,0,0,0.1);
transition:0.3s;
}

.card:hover{
transform:translateY(-5px);
}

.card h1{
color:var(--primary);
}

.warning{
background:#ffdddd;
padding:15px;
border-radius:8px;
margin-bottom:20px;
}

.chart-box{
background:var(--card);
padding:20px;
border-radius:12px;
box-shadow:0 10px 25px rgba(0,0,0,0.1);
margin-bottom:30px;
}

/* AI Insight */
.insight-box{
background:var(--card);
padding:20px;
border-radius:12px;
box-shadow:0 10px 25px rgba(0,0,0,0.1);
margin-bottom:30px;
}

.progress{
height:15px;
background:#ddd;
border-radius:10px;
overflow:hidden;
margin-top:10px;
}
.progress-bar{
height:100%;
background:var(--primary);
transition:0.6s;
}

.extra-row{
display:flex;
flex-wrap:wrap;
gap:20px;
margin-bottom:30px;
}

.extra-row .card{
flex: 1 1 300px;   /* minimum 300px width */
max-width:100%;
}

.score{
font-size:26px;
font-weight:bold;
color:<?php echo $score > 70 ? 'green' : ($score > 40 ? 'orange' : 'red'); ?>;
}

.recent-table{
width:100%;
border-collapse:collapse;
}
.recent-table th,
.recent-table td{
padding:8px;
text-align:center;
}
.recent-table th{
background:var(--primary);
color:white;
}
</style>
</head>

<body>

<div class="sidebar">
<h2>TrackWise</h2>
<a href="dashboard.php">Dashboard</a>
<a href="add_expense.php">Add Expense</a>
<a href="export_pdf.php" target="_blank">Export PDF</a>
<a href="logout.php">Logout</a>
</div>

<div class="main">

<div class="topbar">
<h2>Welcome, <?php echo $username; ?></h2>

<div class="header-right">

<div class="toggle" onclick="toggleDark()">🌙</div>

<div class="bell">
🔔
<div class="notification-box">
<p><strong>Total:</strong> ₹<?php echo number_format($total); ?></p>
<p><strong>Budget:</strong> ₹<?php echo number_format($budget); ?></p>
<?php if($budgetExceeded): ?>
<p style="color:red;">⚠ Budget Exceeded</p>
<?php else: ?>
<p style="color:green;">✔ Within Budget</p>
<?php endif; ?>
</div>
</div>

<div class="user-info">
<?php if($photo): ?>
<img src="uploads/<?php echo $photo; ?>">
<?php else: ?>
<img src="https://via.placeholder.com/45">
<?php endif; ?>

<div class="dropdown">
<a href="profile.php">Profile</a>
<a href="change_password.php">Change Password</a>
<a href="logout.php">Logout</a>
</div>
</div>

</div>
</div>

<?php if($budgetExceeded): ?>
<div class="warning">
⚠ You exceeded your budget of ₹<?php echo $budget; ?>
</div>
<?php endif; ?>

<!-- TOP 3 SUMMARY CARDS -->
<div class="card-container">
    <div class="card">
        <h3>Total Expense</h3>
        <h1 id="totalCount">0</h1>
    </div>

    <div class="card">
        <h3>Budget Limit</h3>
        <h1 id="budgetCount">0</h1>
    </div>

    <div class="card">
        <h3>Remaining</h3>
        <h1 id="remainingCount">0</h1>
    </div>
</div>

<!-- Budget Progress -->
<div class="card">
    <h3>Budget Usage</h3>
    <div class="progress">
        <div class="progress-bar" style="width:<?php echo $budgetPercent; ?>%"></div>
    </div>
    <p><?php echo round($budgetPercent); ?>% Used</p>
</div>

<!-- Comparison + Top Category -->
<div class="extra-row">
    <div class="card">
        <h3>Month Comparison</h3>
        <p>
        <?php
        if($comparison > 0){
            echo "🔺 Increased by ".round($comparison,1)."%";
        }else{
            echo "🔻 Decreased by ".abs(round($comparison,1))."%";
        }
        ?>
        </p>
    </div>

    <div class="card">
        <h3>Top Spending Category</h3>
        <p>
        <?php
        if($topCategory){
            echo $topCategory['category_name']." (₹".number_format($topCategory['total']).")";
        }else{
            echo "No data yet";
        }
        ?>
        </p>
    </div>
</div>

<!-- Financial Score -->
<div class="card">
    <h3>Financial Health Score</h3>
    <div class="score"><?php echo $score; ?>/100</div>
</div>

<!-- Recent Transactions -->
<div class="card">
    <h3>Recent Transactions</h3>
    <table class="recent-table">
        <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Description</th>
            <th>Amount</th>
        </tr>
        <?php while($row=$recent->fetch_assoc()): ?>
        <tr>
            <td><?php echo $row['expense_date']; ?></td>
            <td><?php echo $row['category_name']; ?></td>
            <td><?php echo $row['description']; ?></td>
            <td>₹<?php echo number_format($row['amount']); ?></td>
        </tr>
        <?php endwhile; ?>
    </table>
</div>

<div class="insight-box">
<h3>AI Insight</h3>
<p>
<?php
if($budgetExceeded){
echo "⚠ Your spending crossed the budget. Review high-value expenses immediately.";
}
elseif($remaining > ($budget * 0.5)){
echo "✅ Excellent control. More than 50% of your budget remains.";
}
else{
echo "📊 Spending is moderate. Monitor upcoming expenses carefully.";
}
?>
</p>
</div>

<div class="chart-box">
<h3>Expense Distribution</h3>
<div style="width:300px;">
<canvas id="pieChart"></canvas>
</div>
</div>

<div class="chart-box">
<h3>Monthly Trend</h3>
<canvas id="lineChart"></canvas>
</div>

</div>

<script>
function toggleDark(){
document.body.classList.toggle('dark');
localStorage.setItem("darkMode",document.body.classList.contains("dark"));
}

if(localStorage.getItem("darkMode") === "true"){
document.body.classList.add("dark");
}

/* Smooth Flash Counter */
function smoothCount(id,end){
let el=document.getElementById(id);
let duration=500;
let startTime=null;

function animate(currentTime){
if(!startTime) startTime=currentTime;
let progress=currentTime-startTime;
let percentage=Math.min(progress/duration,1);
let easeOut = 1 - Math.pow(1 - percentage, 3);
let value = Math.floor(easeOut * end);
el.innerHTML=value.toLocaleString();
if(progress<duration){
requestAnimationFrame(animate);
}
}
requestAnimationFrame(animate);
}

smoothCount("totalCount",<?php echo (int)$total; ?>);
smoothCount("budgetCount",<?php echo (int)$budget; ?>);
smoothCount("remainingCount",<?php echo (int)$remaining; ?>);

/* Charts */
new Chart(document.getElementById('pieChart'),{
type:'pie',
data:{
labels:<?php echo json_encode($categories); ?>,
datasets:[{
data:<?php echo json_encode($amounts); ?>,
backgroundColor:['#1e3c72','#2a5298','#4e73df','#36b9cc','#f6c23e']
}]
}
});

new Chart(document.getElementById('lineChart'),{
type:'line',
data:{
labels:<?php echo json_encode($months); ?>,
datasets:[{
label:'Monthly Expense',
data:<?php echo json_encode($monthAmounts); ?>,
borderColor:'#4e73df',
fill:false,
tension:0.3
}]
}
});
</script>

</body>
</html>
