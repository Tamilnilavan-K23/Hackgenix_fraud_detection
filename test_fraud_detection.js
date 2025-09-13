const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function testFraudDetection() {
  try {
    console.log('Testing fraud detection with sample CSV...');
    
    const form = new FormData();
    form.append('file', fs.createReadStream('D:\hackgenix\main\DATASET\DATASET\fraud_dataset_val.csv'));
    
    const response = await axios.post('http://localhost:5001/process-csv', form, {
      headers: {
        ...form.getHeaders(),
      },
    });
    
    console.log('✅ Fraud detection response:');
    console.log('Total predictions:', response.data.predictions.totalPredictions);
    console.log('Fraudulent transactions:', response.data.predictions.fraudulentTransactions);
    console.log('High risk transactions:', response.data.predictions.highRiskTransactions);
    
    if (response.data.predictions.fraudulentTransactions > 0) {
      console.log('🎉 SUCCESS: Fraud detection is working! Found', response.data.predictions.fraudulentTransactions, 'fraudulent transactions');
    } else {
      console.log('❌ ISSUE: No fraudulent transactions detected');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testFraudDetection();
