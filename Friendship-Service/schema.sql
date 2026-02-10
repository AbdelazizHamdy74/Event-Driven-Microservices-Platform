CREATE TABLE IF NOT EXISTS friendships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user1_id INT NOT NULL,
  user2_id INT NOT NULL,
  status ENUM('PENDING', 'FRIENDS', 'BLOCKED') NOT NULL,
  requested_by INT NULL,
  blocked_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_friend_pair (user1_id, user2_id),
  INDEX idx_user1 (user1_id),
  INDEX idx_user2 (user2_id),
  INDEX idx_status (status)
);
