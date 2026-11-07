<script>
function toggleDark(){
    document.body.classList.toggle('dark');
    localStorage.setItem("darkMode",document.body.classList.contains("dark"));
}

if(localStorage.getItem("darkMode") === "true"){
    document.body.classList.add("dark");
}

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