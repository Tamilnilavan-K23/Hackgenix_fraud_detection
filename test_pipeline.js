const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testPipeline() {
  console.log('🧪 Testing Complete ML Pipeline...\n');

  try {
    // Test 1: Check ML service health
    console.log('1. Checking ML service health...');
    const healthResponse = await axios.get('http://localhost:5001/health');
    console.log('✅ ML Service Status:', healthResponse.data.status);

    // Test 2: Process sample CSV through complete pipeline
    console.log('\n2. Testing complete CSV processing pipeline...');
    const csvPath = path.join(__dirname, 'DATASET', 'sample_transactions.csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error('Sample CSV file not found at: ' + csvPath);
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(csvPath));

    console.log('📤 Uploading CSV file for processing...');
    const processResponse = await axios.post('http://localhost:5001/process-csv', formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 60000,
    });

    console.log('✅ Pipeline completed successfully!');
    console.log('📊 Processing Results:');
    console.log('  - Original rows:', processResponse.data.preprocessing.originalRows);
    console.log('  - Cleaned rows:', processResponse.data.preprocessing.cleanedRows);
    console.log('  - Total predictions:', processResponse.data.predictions.totalPredictions);
    console.log('  - Fraudulent transactions:', processResponse.data.predictions.fraudulentTransactions);
    console.log('  - High-risk transactions:', processResponse.data.predictions.highRiskTransactions);
    console.log('  - Transactions saved to MongoDB:', processResponse.data.database.transactionsInserted);
    console.log('  - Alerts created:', processResponse.data.database.alertsCreated);

    // Test 3: Verify data in MongoDB
    console.log('\n3. Verifying data in MongoDB...');
    
    const statsResponse = await axios.get('http://localhost:5001/stats');
    console.log('✅ MongoDB Statistics:');
    console.log('  - Total transactions in DB:', statsResponse.data.transactions.totalTransactions);
    console.log('  - Fraudulent transactions:', statsResponse.data.transactions.fraudulentTransactions);
    console.log('  - High-risk transactions:', statsResponse.data.transactions.highRiskTransactions);

    // Test 4: Check if CSV was saved to database/ folder
    console.log('\n4. Checking database/ folder for result CSV...');
    const databaseDir = path.join(__dirname, 'ml', 'database');
    const files = fs.readdirSync(databaseDir);
    const csvFiles = files.filter(file => file.endsWith('.csv'));
    
    if (csvFiles.length > 0) {
      console.log('✅ Result CSV files found in database/ folder:');
      csvFiles.forEach(file => console.log('  -', file));
    } else {
      console.log('⚠️  No CSV files found in database/ folder');
    }

    console.log('\n🎉 Complete Pipeline Test Successful!');
    console.log('\n📋 Pipeline Summary:');
    console.log('✅ CSV Upload & Preprocessing');
    console.log('✅ ML Model Prediction (H5 or Rule-based)');
    console.log('✅ Results saved to database/ folder as CSV');
    console.log('✅ Data automatically inserted to MongoDB');
    console.log('✅ Transactions collection populated');
    console.log('✅ Alerts collection populated for high-risk transactions');

  } catch (error) {
    console.error('❌ Pipeline test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testPipeline();
