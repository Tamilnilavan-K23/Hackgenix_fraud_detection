import { MongoClient } from 'mongodb';

async function checkMongoCollections() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('fraudshield');
    
    // Check transactions collection
    const transactionsCount = await db.collection('transactions').countDocuments();
    console.log(`Transactions in database: ${transactionsCount}`);
    
    if (transactionsCount > 0) {
      const sampleTransactions = await db.collection('transactions').find().limit(5).toArray();
      console.log('\nSample transactions:');
      sampleTransactions.forEach(t => {
        console.log(`- ${t.Transaction_ID}: ${t.risk_level} (${t.fraud_flag ? 'FRAUD' : 'CLEAN'})`);
      });
    }
    
    // Check alerts collection
    const alertsCount = await db.collection('alerts').countDocuments();
    console.log(`\nAlerts in database: ${alertsCount}`);
    
    if (alertsCount > 0) {
      const sampleAlerts = await db.collection('alerts').find().limit(3).toArray();
      console.log('\nSample alerts:');
      sampleAlerts.forEach(a => {
        console.log(`- ${a.Transaction_ID}: ${a.risk_level} - ${a.reason}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkMongoCollections();
