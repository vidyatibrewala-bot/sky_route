import gymnasium as gym
from stable_baselines3 import PPO
from stable_baselines3.common.env_checker import check_env
from drone_env import DroneAidEnv
import numpy as np
import time

def main():
    print("Testing the custom DroneAidEnv (30x30)...")
    env = DroneAidEnv()
    check_env(env, warn=True)
    print("Environment check passed!")

    # Unregister if already present to avoid id conflicts
    if 'DroneAid-v1' in gym.envs.registration.registry:
        del gym.envs.registration.registry['DroneAid-v1']

    gym.register(
        id='DroneAid-v1',
        entry_point='drone_env:DroneAidEnv',
    )
    
    print("\n--- Starting Training (30x30 Grid) ---")
    train_env = gym.make("DroneAid-v1")
    
    # Policy Optimization
    model = PPO("MlpPolicy", train_env, verbose=1, learning_rate=0.0007)
    
    # Train for 10k steps for proof of concept
    model.learn(total_timesteps=10000)
    
    model.save("ppo_drone_30x30")
    print("\nTraining complete! Agent saved as ppo_drone_30x30.zip")
    
    print("\n--- Testing Trained Autonomous Pilot ---")
    test_env = gym.make("DroneAid-v1", render_mode="human")
    obs, info = test_env.reset()
    
    action_names = {0: "Up", 1: "Down", 2: "Left", 3: "Right"}
    
    for i in range(50):
        action, _ = model.predict(obs, deterministic=True)
        # FIX: Ensure action is converted to item for dict indexing
        act_val = int(action.item()) if isinstance(action, (np.ndarray, np.generic)) else int(action)
        
        obs, reward, done, truncated, info = test_env.step(act_val)
        
        print(f"\nStep {i+1} | Pilot Action: {action_names[act_val]}")
        test_env.render()
        
        if done or truncated:
            print("Mission Phase Concluded.")
            break
        time.sleep(0.3)

if __name__ == "__main__":
    main()
