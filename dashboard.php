<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}
require_once "config.php";
$uid = $_SESSION['user_id'];

$userData = $conn->query("SELECT name,budget,photo FROM users WHERE user_id=$uid")->fetch_assoc();
$username = $userData['name'];
$budget   = $userData['budget'];
$photo    = $userData['photo'];

$expenseTotal = $conn->query("SELECT SUM(amount) t FROM expenses WHERE user_id=$uid")->fetch_assoc()['t'] ?? 0;
$incomeTotal  = $conn->query("SELECT SUM(amount) t FROM transactions WHERE user_id=$uid AND type='income'")->fetch_assoc()['t'] ?? 0;

$total      = $expenseTotal;
$netSavings = $incomeTotal - $expenseTotal;
$remaining  = max($budget - $total, 0);

$catResult = $conn->query("
    SELECT c.category_name, SUM(e.amount) total
    FROM expenses e
    JOIN categories c ON e.category_id=c.category_id
    WHERE e.user_id=$uid
    GROUP BY c.category_name
");
$categories = [];
$amounts    = [];
while($row = $catResult->fetch_assoc()){
    $categories[] = $row['category_name'];
    $amounts[]    = $row['total'];
}

$monthResult = $conn->query("
    SELECT MONTH(expense_date) m, SUM(amount) total
    FROM expenses WHERE user_id=$uid
    GROUP BY MONTH(expense_date) ORDER BY m
");
$months      = [];
$monthAmounts = [];
while($row = $monthResult->fetch_assoc()){
    $months[]       = "Month ".$row['m'];
    $monthAmounts[] = $row['total'];
}

$budgetExceeded = $total > $budget;
$budgetPercent  = $budget > 0 ? min(100, ($total / $budget) * 100) : 0;

$currentMonth = date('m');
$prevMonth    = date('m', strtotime('-1 month'));

$currentMonthTotal = $conn->query("SELECT SUM(amount) t FROM expenses WHERE user_id=$uid AND MONTH(expense_date)=$currentMonth")->fetch_assoc()['t'] ?? 0;
$prevMonthTotal    = $conn->query("SELECT SUM(amount) t FROM expenses WHERE user_id=$uid AND MONTH(expense_date)=$prevMonth")->fetch_assoc()['t'] ?? 0;

$comparison = ($prevMonthTotal > 0) ? (($currentMonthTotal - $prevMonthTotal) / $prevMonthTotal) * 100 : 0;

$topCategory = $conn->query("
    SELECT c.category_name, SUM(e.amount) total
    FROM expenses e JOIN categories c ON e.category_id=c.category_id
    WHERE e.user_id=$uid GROUP BY c.category_name ORDER BY total DESC LIMIT 1
")->fetch_assoc();

$score = 100;
if($budgetPercent > 100) $score -= 40;
if($budgetPercent > 80)  $score -= 20;
if($comparison > 20)     $score -= 15;
$score = max(0, $score);
$scoreColor = $score > 70 ? 'var(--success)' : ($score > 40 ? 'var(--warning)' : 'var(--danger)');

$recent = $conn->query("
    SELECT e.amount, e.description, e.expense_date, c.category_name
    FROM expenses e JOIN categories c ON e.category_id=c.category_id
    WHERE e.user_id=$uid ORDER BY e.expense_date DESC LIMIT 5
");


?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Dashboard — Finlytics</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>

<?php include 'sidebar.php'; ?>

<div class="main">

    <!-- TOPBAR -->
    <div class="topbar">
        <h2>Welcome back, <?php echo htmlspecialchars($username); ?> 👋</h2>

        <div class="header-right">
            <div class="bell">
                🔔
                <div class="notification-box">
                    <p><strong>Total Spent:</strong> ₹<?php echo number_format($total); ?></p>
                    <p><strong>Budget:</strong> ₹<?php echo number_format($budget); ?></p>
                    <?php if($budgetExceeded): ?>
                        <p style="color:var(--danger);">⚠ Budget Exceeded!</p>
                    <?php else: ?>
                        <p style="color:var(--success);">✔ Within Budget</p>
                    <?php endif; ?>
                </div>
            </div>

            <div class="user-info">
                <?php if($photo): ?>
                    <img src="uploads/<?php echo htmlspecialchars($photo); ?>" alt="Profile">
                <?php else: ?>
                    <img src="https://ui-avatars.com/api/?name=<?php echo urlencode($username); ?>&size=42&background=1e3c72&color=fff&rounded=true" alt="Avatar">
                <?php endif; ?>
                <div class="dropdown">
                    <a href="profile.php">👤 Profile</a>
                    <a href="change_password.php">🔒 Change Password</a>
                    <a href="logout.php">🚪 Logout</a>
                </div>
            </div>
        </div>
    </div>

    <!-- BUDGET EXCEEDED WARNING -->
    <?php if($budgetExceeded): ?>
    <div class="warning-banner">
        ⚠ You have exceeded your monthly budget of ₹<?php echo number_format($budget); ?>!
    </div>
    <?php endif; ?>

    <!-- SUMMARY CARDS -->
    <div class="card-container">
        <div class="card">
            <h3>Total Income</h3>
            <h1 style="color:var(--success);" data-count="<?php echo (int)$incomeTotal; ?>">₹<?php echo number_format($incomeTotal); ?></h1>
        </div>
        <div class="card">
            <h3>Total Expense</h3>
            <h1 style="color:var(--danger);" data-count="<?php echo (int)$expenseTotal; ?>">₹<?php echo number_format($expenseTotal); ?></h1>
        </div>
        <div class="card">
            <h3>Net Savings</h3>
            <h1 style="color:<?php echo $netSavings >= 0 ? 'var(--success)' : 'var(--danger)'; ?>;">
                ₹<?php echo number_format($netSavings); ?>
            </h1>
        </div>
        <div class="card">
            <h3>Remaining</h3>
            <h1 style="color:<?php echo $remaining > 0 ? 'var(--success)' : 'var(--danger)'; ?>;">
                ₹<?php echo number_format($remaining); ?>
            </h1>
            </div>
        <div class="card">
            <h3>Budget Limit</h3>
            <h1 data-count="<?php echo (int)$budget; ?>">₹<?php echo number_format($budget); ?></h1>
        
        </div>
    </div>

    <!-- BUDGET PROGRESS -->
    <div class="section-card">
        <h3>Budget Usage — <?php echo round($budgetPercent); ?>% used</h3>
        <div class="progress">
            <div class="progress-bar" style="width:<?php echo $budgetPercent; ?>%;
                background:<?php echo $budgetPercent >= 100 ? 'var(--danger)' : ($budgetPercent >= 80 ? 'var(--warning)' : ''); ?>;">
            </div>
        </div>
        <p class="text-muted mt-8">₹<?php echo number_format($total); ?> spent of ₹<?php echo number_format($budget); ?></p>
    </div>

    <!-- MONTH COMPARISON + TOP CATEGORY -->
    <div class="extra-row">
        <div class="card">
            <h3>Month Comparison</h3>
            <p style="font-size:22px; font-weight:700; margin-top:8px;">
                <?php echo $comparison > 0 ? "🔺 +" : "🔻 "; ?>
                <?php echo abs(round($comparison, 1)); ?>%
            </p>
            <p class="text-muted mt-4">vs. last month</p>
        </div>
        <div class="card">
            <h3>Top Spending Category</h3>
            <p style="font-size:18px; font-weight:700; margin-top:8px; color:var(--primary);">
                <?php echo $topCategory ? $topCategory['category_name'] : "No data yet"; ?>
            </p>
            <?php if($topCategory): ?>
                <p class="text-muted mt-4">₹<?php echo number_format($topCategory['total']); ?></p>
            <?php endif; ?>
        </div>
        <div class="card">
            <h3>Financial Health Score</h3>
            <div class="score-display mt-8" style="color:<?php echo $scoreColor; ?>;">
                <?php echo $score; ?><span style="font-size:20px; font-weight:400;">/100</span>
            </div>
        </div>
    </div>

    <!-- AI INSIGHT -->
    <div class="insight-box">
        <h3>AI Insight</h3>
        <p>
        <?php
        if($budgetExceeded){
            echo "⚠ Your spending crossed the budget. Review your high-value expenses immediately.";
        } elseif($remaining > ($budget * 0.5)){
            echo "Excellent control! More than 50% of your budget remains. Keep it up.";
        } elseif($comparison > 20){
            echo "Your spending has increased significantly vs last month. Monitor upcoming expenses.";
        } else {
            echo "Spending is moderate. Continue tracking to maintain healthy finances.";
        }
        ?>
        </p>
    </div>

    <!-- RECENT TRANSACTIONS -->
    <div class="section-card">
        <h3>Recent Transactions</h3>
        <div style="overflow-x:auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                <?php while($row = $recent->fetch_assoc()): ?>
                <tr>
                    <td><?php echo $row['expense_date']; ?></td>
                    <td><?php echo $row['category_name']; ?></td>
                    <td><?php echo $row['description'] ?: '—'; ?></td>
                    <td style="color:var(--danger); font-weight:600;">
                        ₹<?php echo number_format($row['amount']); ?>
                    </td>
                </tr>
                <?php endwhile; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- CHARTS -->
    <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:26px;">
        <div class="chart-box" style="flex:1; min-width:280px;">
            <h3>Expense Distribution</h3>
            <div style="max-width:320px; margin:auto;">
                <canvas id="pieChart"></canvas>
            </div>
        </div>
        <div class="chart-box" style="flex:2; min-width:320px;">
            <h3>Monthly Trend</h3>
            <canvas id="lineChart"></canvas>
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

// ── Number Counter ──
function animateCount(el, target, duration) {
    var start = 0;
    var startTime = null;
    var isNegative = target < 0;
    var abs = Math.abs(target);

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        var ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        var current = Math.floor(ease * abs);
        el.textContent = (isNegative ? '-' : '') + '₹' + current.toLocaleString('en-IN');
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = (isNegative ? '-' : '') + '₹' + abs.toLocaleString('en-IN');
    }
    requestAnimationFrame(step);
}

// Run counters when cards are visible
var counterTargets = document.querySelectorAll('.card h1[data-count]');
var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
        if (entry.isIntersecting && !entry.target.dataset.done) {
            entry.target.dataset.done = '1';
            animateCount(entry.target, parseInt(entry.target.dataset.count), 900);
        }
    });
}, { threshold: 0.3 });
counterTargets.forEach(function(el) { observer.observe(el); });

// ── Charts with animation ──
Chart.defaults.animation = {
    duration: 800,
    easing: 'easeOutQuart'
};

var isDark = !document.body.classList.contains('light');
var legendColor = isDark ? '#a8a8a3' : '#5a5a55';
var gridColor   = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

new Chart(document.getElementById('pieChart'), {
    type: 'pie',
    data: {
        labels: <?php echo json_encode($categories); ?>,
        datasets: [{
            data: <?php echo json_encode($amounts); ?>,
            backgroundColor: ['#cc7a3e','#6b9cf7','#5cb98a','#d4a84b','#e0655a','#8b6cf7','#38d9c0'],
            borderWidth: 0,
            hoverOffset: 8
        }]
    },
    options: {
        animation: { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' },
        plugins: {
            legend: {
                position: 'bottom',
                labels: { color: legendColor, padding: 16, font: { size: 12 } }
            }
        }
    }
});

new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
        labels: <?php echo json_encode($months); ?>,
        datasets: [{
            label: 'Monthly Expense',
            data: <?php echo json_encode($monthAmounts); ?>,
            borderColor: '#cc7a3e',
            backgroundColor: 'rgba(204,122,62,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: '#cc7a3e',
            pointBorderColor: 'transparent',
            borderWidth: 2.5
        }]
    },
    options: {
        animation: { duration: 1000, easing: 'easeOutQuart' },
        plugins: {
            legend: { labels: { color: legendColor, font: { size: 12 } } }
        },
        scales: {
            x: {
                grid: { color: gridColor },
                ticks: { color: legendColor }
            },
            y: {
                beginAtZero: true,
                grid: { color: gridColor },
                ticks: { color: legendColor }
            }
        }
    }
});

// ── Click-based notification & profile dropdown ──
(function(){
    var bell     = document.querySelector('.bell');
    var notifBox = document.querySelector('.notification-box');
    var userInfo = document.querySelector('.user-info');
    var dropdown = document.querySelector('.dropdown');

    function closeAll(){
        if(notifBox) notifBox.classList.remove('open');
        if(dropdown) dropdown.classList.remove('open');
    }

    if(bell && notifBox){
        bell.addEventListener('click', function(e){
            e.stopPropagation();
            var isOpen = notifBox.classList.contains('open');
            closeAll();
            if(!isOpen) notifBox.classList.add('open');
        });
    }

    if(userInfo && dropdown){
        // only toggle on img click, not on dropdown link clicks
        var img = userInfo.querySelector('img');
        if(img){
            img.addEventListener('click', function(e){
                e.stopPropagation();
                var isOpen = dropdown.classList.contains('open');
                closeAll();
                if(!isOpen) dropdown.classList.add('open');
            });
        }
        // let dropdown links navigate freely
        dropdown.addEventListener('click', function(e){
            e.stopPropagation();
        });
    }

    document.addEventListener('click', function(){ closeAll(); });
})();

</script>

</body>
</html>