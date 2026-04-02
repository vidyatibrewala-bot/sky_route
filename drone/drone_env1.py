import gymnasium as gym
from gymnasium import spaces
import numpy as np

class DroneAidEnv(gym.Env):
    metadata = {"render_modes": ["ansi", "human"]}

    def __init__(self, render_mode=None):
        super(DroneAidEnv, self).__init__()
        
        self.render_mode = render_mode
        self.grid_size = 30 # Scaled to match UI
        
        # State: [drone_x, drone_y, target_x, target_y, battery, urgency]
        self.observation_space = spaces.Box(
            low=np.array([0, 0, 0, 0, 0.0, 0.0], dtype=np.float32),
            high=np.array([self.grid_size - 1, self.grid_size - 1, self.grid_size - 1, self.grid_size - 1, 150.0, 1.0], dtype=np.float32),
            dtype=np.float32
        )
        
        # Actions: 0: Up, 1: Down, 2: Left, 3: Right
        self.action_space = spaces.Discrete(4)
        
        # Action mappings (Tuples are safer)
        self._action_to_direction = {
            0: (-1, 0), # Up
            1: (1, 0),  # Down
            2: (0, -1), # Left
            3: (0, 1),  # Right
        }
        
    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        
        self.battery = 150.0 # Increased battery for 30x30 range
        self.urgency = float(self.np_random.choice([0.0, 1.0]))
        
        self.drone_pos = self._get_random_pos()
        self.target_pos = self._get_random_pos(exclude=[self.drone_pos])
        
        # Increased obstacles for larger grid: 15 to 25
        num_obstacles = int(self.np_random.integers(15, 26))
        self.obstacles = set()
        
        while len(self.obstacles) < num_obstacles:
            obs_pos = self._get_random_pos(exclude=[self.drone_pos, self.target_pos] + list(self.obstacles))
            self.obstacles.add(obs_pos)
        
        self.done = False
        return self._get_obs(), self._get_info()
    
    def _get_random_pos(self, exclude=[]):
        while True:
            pos = (int(self.np_random.integers(0, self.grid_size)), int(self.np_random.integers(0, self.grid_size)))
            if pos not in exclude:
                return pos
                
    def _get_obs(self):
        return np.array([
            float(self.drone_pos[0]), float(self.drone_pos[1]),
            float(self.target_pos[0]), float(self.target_pos[1]),
            float(self.battery), float(self.urgency)
        ], dtype=np.float32)
        
    def _get_info(self):
        return {
            "battery": self.battery,
            "urgency": "High" if self.urgency == 1.0 else "Low"
        }
        
    def step(self, action):
        # Handle SB3's numpy action safely
        if isinstance(action, (np.ndarray, np.generic)):
            act = int(action.item())
        else:
            act = int(action)
            
        if self.done:
            return self._get_obs(), 0.0, True, False, self._get_info()
        
        direction = self._action_to_direction[act]
        
        # Coordinate update (Ensure they are ints)
        new_pos = (
            int(np.clip(self.drone_pos[0] + direction[0], 0, self.grid_size - 1)),
            int(np.clip(self.drone_pos[1] + direction[1], 0, self.grid_size - 1))
        )
        
        # Battery consumption (scaled for 30x30)
        battery_cost = 2.0 if self.urgency == 1.0 else 1.0
        self.battery = max(0.0, self.battery - battery_cost)
        
        self.drone_pos = new_pos
        
        reward = -0.1 # Small penalty to encourage speed
        terminated = False
        
        # Failure Check: Battery
        if self.battery <= 0:
            reward = -500.0
            terminated = True
        
        # Failure Check: Obstacles
        elif self.drone_pos in self.obstacles:
            reward = -500.0
            terminated = True
            
        # Success Check: Target
        elif self.drone_pos == self.target_pos:
            reward = 1000.0 + (self.battery * 2) # Reward based on battery left
            terminated = True
            
        self.done = terminated
        return self._get_obs(), float(reward), terminated, False, self._get_info()
        
    def render(self):
        if self.render_mode == "human" or self.render_mode is None:
            grid = ""
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    pos = (r, c)
                    if pos == self.drone_pos: grid += "D "
                    elif pos == self.target_pos: grid += "T "
                    elif pos in self.obstacles: grid += "X "
                    else: grid += ". "
                grid += "\n"
            print(f"--- 30x30 Grid | Battery: {self.battery:.1f}% ---")
            print(grid)
            return grid
