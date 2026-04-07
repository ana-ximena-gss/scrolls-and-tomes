//Calculate XP and track user progress
//XP earned based on difficulty (change if needed)
function calculateXP(difficulty) {
    switch(difficulty.toLowerCase()) {
        case 'easy':
            return 5;
        case 'medium':
            return 10;
        case 'hard':
            return 15;
        default:
            return 0; 
    }
}

//User titles based on total XP (change if needed)
function determineRank(totalXP) {
    if (totalXP >= 1000) return 'Grandmaster';
    if (totalXP >= 700) return 'Master';
    if (totalXP >= 500) return 'Diamond';
    if (totalXP >= 300) return 'Plat';
    if (totalXP >= 100) return 'Gold';
    if (totalXP >= 50) return 'Silver';

    return 'Bronze'; 
}

//Export to the db to be used
module.exports = { calculateXP, determineRank};