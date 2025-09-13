import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

export class DatabaseService {
  constructor() {
    this.client = null;
    this.db = null;
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/fraudshield';
  }

  async connect() {
    try {
      this.client = new MongoClient(this.connectionString);
      await this.client.connect();
      this.db = this.client.db('fraudshield');
      console.log('Connected to MongoDB');
      return true;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
        console.log('Disconnected from MongoDB');
      }
    } catch (error) {
      console.error('MongoDB disconnection error:', error);
    }
  }

  async saveTransactions(predictions) {
    try {
      if (!this.db) {
        await this.connect();
      }

      const transactionsCollection = this.db.collection('transactions');
      const alertsCollection = this.db.collection('alerts');

      const transactionDocs = predictions.map(pred => ({
        Transaction_ID: pred.Transaction_ID,
        ml_pred_prob: pred.ml_pred_prob,
        fraud_flag: pred.fraud_flag,
        risk_level: pred.risk_level,
        reason: pred.reason,
        created_at: new Date(),
        updated_at: new Date()
      })).filter(doc => doc.Transaction_ID); // Filter out null Transaction_IDs

      // Insert transactions with upsert to handle duplicates
      let transactionResult = { insertedCount: 0 };
      if (transactionDocs.length > 0) {
        try {
          transactionResult = await transactionsCollection.insertMany(transactionDocs, { ordered: false });
          console.log(`Inserted ${transactionResult.insertedCount} transactions`);
        } catch (error) {
          if (error.code === 11000) {
            // Handle duplicate key errors by inserting individually
            let insertedCount = 0;
            for (const doc of transactionDocs) {
              try {
                await transactionsCollection.replaceOne(
                  { Transaction_ID: doc.Transaction_ID },
                  doc,
                  { upsert: true }
                );
                insertedCount++;
              } catch (individualError) {
                console.warn(`Failed to upsert transaction ${doc.Transaction_ID}:`, individualError.message);
              }
            }
            transactionResult = { insertedCount };
            console.log(`Upserted ${insertedCount} transactions`);
          } else {
            throw error;
          }
        }
      }

      // Create alerts for high-risk transactions with proper handling
      const alertDocs = predictions
        .filter(pred => pred.risk_level === 'HIGH' || pred.fraud_flag === 1)
        .map(pred => ({
          Transaction_ID: pred.Transaction_ID,
          risk_level: pred.risk_level,
          reason: pred.reason,
          created_at: new Date(),
          updated_at: new Date()
        }))
        .filter(doc => doc.Transaction_ID); // Filter out null Transaction_IDs

      let alertResult = { insertedCount: 0 };
      if (alertDocs.length > 0) {
        try {
          alertResult = await alertsCollection.insertMany(alertDocs, { ordered: false });
          console.log(`Created ${alertResult.insertedCount} alerts`);
        } catch (error) {
          if (error.code === 11000) {
            // Handle duplicate key errors by upserting individually
            let insertedCount = 0;
            for (const doc of alertDocs) {
              try {
                await alertsCollection.replaceOne(
                  { Transaction_ID: doc.Transaction_ID },
                  doc,
                  { upsert: true }
                );
                insertedCount++;
              } catch (individualError) {
                console.warn(`Failed to upsert alert ${doc.Transaction_ID}:`, individualError.message);
              }
            }
            alertResult = { insertedCount };
            console.log(`Upserted ${insertedCount} alerts`);
          } else {
            throw error;
          }
        }
      }

      return {
        success: true,
        transactionsInserted: transactionResult.insertedCount,
        alertsCreated: alertDocs.length,
        transactionIds: transactionDocs.map(doc => doc.Transaction_ID)
      };
    } catch (error) {
      console.error('Database save error:', error);
      throw error;
    }
  }

  async getTransactions(filter = {}, limit = 100) {
    try {
      if (!this.db) {
        await this.connect();
      }

      const collection = this.db.collection('transactions');
      const transactions = await collection
        .find(filter)
        .sort({ created_at: -1 })
        .limit(limit)
        .toArray();

      return transactions;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  }

  async getAlerts(filter = {}, limit = 100) {
    try {
      if (!this.db) {
        await this.connect();
      }

      const collection = this.db.collection('alerts');
      const alerts = await collection
        .find(filter)
        .sort({ created_at: -1 })
        .limit(limit)
        .toArray();

      return alerts;
    } catch (error) {
      console.error('Error fetching alerts:', error);
      throw error;
    }
  }

  async updateAlert(alertId, updates) {
    try {
      if (!this.db) {
        await this.connect();
      }

      const collection = this.db.collection('alerts');
      const result = await collection.updateOne(
        { _id: alertId },
        { 
          $set: { 
            ...updates, 
            updated_at: new Date() 
          } 
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error updating alert:', error);
      throw error;
    }
  }

  async getTransactionStats() {
    try {
      if (!this.db) {
        await this.connect();
      }

      const transactionsCollection = this.db.collection('transactions');
      
      const stats = await transactionsCollection.aggregate([
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            fraudulentTransactions: {
              $sum: { $cond: [{ $eq: ['$fraud_flag', 1] }, 1, 0] }
            },
            highRiskTransactions: {
              $sum: { $cond: [{ $eq: ['$risk_level', 'HIGH'] }, 1, 0] }
            },
            mediumRiskTransactions: {
              $sum: { $cond: [{ $eq: ['$risk_level', 'MEDIUM'] }, 1, 0] }
            },
            lowRiskTransactions: {
              $sum: { $cond: [{ $eq: ['$risk_level', 'LOW'] }, 1, 0] }
            },
            avgFraudProbability: { $avg: '$ml_pred_prob' }
          }
        }
      ]).toArray();

      const alertsCollection = this.db.collection('alerts');
      const alertStats = await alertsCollection.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      return {
        transactions: stats[0] || {
          totalTransactions: 0,
          fraudulentTransactions: 0,
          highRiskTransactions: 0,
          mediumRiskTransactions: 0,
          lowRiskTransactions: 0,
          avgFraudProbability: 0
        },
        alerts: alertStats.reduce((acc, stat) => {
          acc[stat._id.toLowerCase()] = stat.count;
          return acc;
        }, { open: 0, closed: 0, investigating: 0 })
      };
    } catch (error) {
      console.error('Error fetching transaction stats:', error);
      throw error;
    }
  }

  async searchTransactions(searchTerm, filters = {}) {
    try {
      if (!this.db) {
        await this.connect();
      }

      const collection = this.db.collection('transactions');
      
      const query = {
        ...filters,
        $or: [
          { Transaction_ID: { $regex: searchTerm, $options: 'i' } },
          { reason: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      const transactions = await collection
        .find(query)
        .sort({ created_at: -1 })
        .limit(100)
        .toArray();

      return transactions;
    } catch (error) {
      console.error('Error searching transactions:', error);
      throw error;
    }
  }

  async getTransactionsByRiskLevel(riskLevel) {
    try {
      return await this.getTransactions({ risk_level: riskLevel });
    } catch (error) {
      console.error(`Error fetching ${riskLevel} risk transactions:`, error);
      throw error;
    }
  }

  async getFraudulentTransactions() {
    try {
      return await this.getTransactions({ fraud_flag: 1 });
    } catch (error) {
      console.error('Error fetching fraudulent transactions:', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      if (!this.db) {
        await this.connect();
      }

      const transactionsCollection = this.db.collection('transactions');
      const alertsCollection = this.db.collection('alerts');

      // Create indexes for better query performance
      await transactionsCollection.createIndex({ Transaction_ID: 1 }, { unique: true });
      await transactionsCollection.createIndex({ fraud_flag: 1 });
      await transactionsCollection.createIndex({ risk_level: 1 });
      await transactionsCollection.createIndex({ created_at: -1 });

      await alertsCollection.createIndex({ Transaction_ID: 1 });
      await alertsCollection.createIndex({ status: 1 });
      await alertsCollection.createIndex({ risk_level: 1 });
      await alertsCollection.createIndex({ created_at: -1 });

      console.log('Database indexes created successfully');
    } catch (error) {
      console.error('Error creating indexes:', error);
      throw error;
    }
  }
}
