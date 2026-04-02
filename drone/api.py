from flask import Flask, request, jsonify
from flask_cors import CORS
from stable_baselines3 import PPO
from drone_env import DroneAidEnv
import numpy as np
import os

app = Flask(__name__)
CORS(app)

# Load the trained model
MODEL_PATH = "ppo_drone_aid.zip"
if not os.path.exists(MODEL_PATH):
    # Try looking for other zipped models if current one isn't found
    MODEL_PATH = "ppo_drone_30x30.zip"

if os.path.exists(MODEL_PATH):
    model = PPO.load(MODEL_PATH)
    print(f"Model loaded: {MODEL_PATH}")
else:
    model = None
    print("Warning: No model found. Predictions will be random.")

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    # Expected data: drone_x, drone_y, target_x, target_y, battery, urgency
    try:
        drone_pos = [data['drone_x'], data['drone_y']]
        target_pos = [data['target_x'], data['target_y']]
        battery = data['battery']
        urgency = data['urgency']
        
        obs = np.array([
            float(drone_pos[0]), float(drone_pos[1]),
            float(target_pos[0]), float(target_pos[1]),
            float(battery), float(urgency)
        ], dtype=np.float32)
        
        if model:
            action, _ = model.predict(obs, deterministic=True)
            # Ensure action is an int
            act_val = int(action.item()) if hasattr(action, 'item') else int(action)
        else:
            # Fallback to random action (0-3)
            act_val = int(np.random.randint(0, 4))
            
        return jsonify({"action": act_val})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ready", "model_loaded": (model is not None)})

if __name__ == '__main__':
    app.run(port=5000)
