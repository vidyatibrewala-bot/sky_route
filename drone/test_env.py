import gymnasium as gym
from drone_env import DroneAidEnv
import time

def main():
    # Register the environment
    gym.register(
        id='DroneAid-v0',
        entry_point='drone_env:DroneAidEnv',
    )
    
    # Create the environment
    env = gym.make('DroneAid-v0', render_mode='human')
    
    print("Testing DroneAid-v0 Environment...")
    obs, info = env.reset(seed=42)
    env.render()
    
    # Run a few random steps
    for step in range(10):
        print(f"\n--- Step {step + 1} ---")
        action = env.action_space.sample()
        
        # 0: Up, 1: Down, 2: Left, 3: Right
        action_names = {0: "Up", 1: "Down", 2: "Left", 3: "Right"}
        print(f"Action chosen: {action_names[action]}")
        
        obs, reward, terminated, truncated, info = env.step(action)
        env.render()
        print(f"Reward: {reward}")
        
        if terminated or truncated:
            print("Episode ended!")
            break
            
        time.sleep(0.5)
        
    env.close()

if __name__ == "__main__":
    main()
