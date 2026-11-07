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