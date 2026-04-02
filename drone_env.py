import gymnasium as gym
from gymnasium import spaces
import numpy as np

class DroneAidEnv(gym.Env):
    metadata = {"render_modes": ["ansi", "human"]}

    def __init__(self, render_mode=None):
        super(DroneAidEnv, self).__init__()
        
        self.render_mode = render_mode
        self.grid_size = 30 
        
        # Observation: [dx, dy, tx, ty, battery, urgency]
        self.observation_space = spaces.Box(
            low=np.array([0, 0, 0, 0, 0.0, 0.0], dtype=np.float32),
            high=np.array([self.grid_size - 1, self.grid_size - 1, self.grid_size - 1, self.grid_size - 1, 500.0, 1.0], dtype=np.float32),
            dtype=np.float32
        )
        
        self.action_space = spaces.Discrete(4)
        self._action_to_direction = {0: (-1, 0), 1: (1, 0), 2: (0, -1), 3: (0, 1)}
        
    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.battery = 500.0 # Synced to 500
        self.urgency = float(self.np_random.choice([0.0, 1.0]))
        self.drone_pos = (int(self.np_random.integers(0, self.grid_size)), int(self.np_random.integers(0, self.grid_size)))
        self.target_pos = (int(self.np_random.integers(0, self.grid_size)), int(self.np_random.integers(0, self.grid_size)))
        
        num_obstacles = int(self.np_random.integers(15, 26))
        self.obstacles = set()
        while len(self.obstacles) < num_obstacles:
            o = (int(self.np_random.integers(0, self.grid_size)), int(self.np_random.integers(0, self.grid_size)))
            if o != self.drone_pos and o != self.target_pos: self.obstacles.add(o)
            
        self.done = False
        return self._get_obs(), {}
    
    def _get_obs(self):
        return np.array([float(self.drone_pos[0]), float(self.drone_pos[1]), float(self.target_pos[0]), float(self.target_pos[1]), float(self.battery), float(self.urgency)], dtype=np.float32)

    def step(self, action):
        act = int(action.item()) if isinstance(action, (np.ndarray, np.generic)) else int(action)
        direction = self._action_to_direction[act]
        new_pos = (int(np.clip(self.drone_pos[0] + direction[0], 0, self.grid_size - 1)), int(np.clip(self.drone_pos[1] + direction[1], 0, self.grid_size - 1)))
        
        cost = 2.0 if self.urgency == 1.0 else 1.0
        self.battery = max(0.0, self.battery - cost)
        self.drone_pos = new_pos
        
        reward = -0.1
        terminated = False
        if self.battery <= 0 or self.drone_pos in self.obstacles:
            reward = -500.0
            terminated = True
        elif self.drone_pos == self.target_pos:
            reward = 1000.0 + (self.battery * 2)
            terminated = True
            
        self.done = terminated
        return self._get_obs(), float(reward), terminated, False, {}

    def render(self): pass
