
import pandas as pd
import numpy as np
from tensorflow.keras.models import load_model
import sys
import os

try:
    # Load the model
    model = load_model('D:/hackgenix/main/ml/src/mlp_fraud_model.h5')
    
    # Load input data
    df = pd.read_csv('D:/hackgenix/main/ml/database/temp_input.csv')
    
    # Prepare features (adjust based on your model's expected input)
    feature_columns = ['Amount', 'Hour_of_Day', 'Is_Night_Transaction', 'Is_High_Amount', 
                      'Amount_Log', 'Category_Risk_Score', 'Is_Foreign', 'Category_Encoded', 'Payment_Method_Encoded']
    
    # Create feature matrix
    X = df[feature_columns].fillna(0).values
    
    # Make predictions
    predictions = model.predict(X)
    
    # Create results DataFrame
    results = pd.DataFrame({
        'Transaction_ID': df['Transaction_ID'],
        'ml_pred_prob': predictions.flatten(),
        'fraud_flag': (predictions.flatten() > 0.5).astype(int),
        'risk_level': ['HIGH' if p > 0.7 else 'MEDIUM' if p > 0.4 else 'LOW' for p in predictions.flatten()],
        'reason': ['ML model prediction' for _ in range(len(predictions))]
    })
    
    # Save results
    results.to_csv('D:/hackgenix/main/ml/database/temp_predictions.csv', index=False)
    print("SUCCESS")
    
except Exception as e:
    print(f"ERROR: {str(e)}")
    sys.exit(1)
