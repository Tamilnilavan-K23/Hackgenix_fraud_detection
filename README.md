# Detectra - No Panic, Just Magic

An AI-powered fraud detection platform that provides comprehensive transaction analysis and real-time fraud detection capabilities.

## 🚀 Features

- **Real-time Fraud Detection**: Advanced ML algorithms for transaction analysis
- **CSV Data Upload**: Bulk transaction processing and analysis
- **Interactive Dashboard**: Comprehensive fraud statistics and visualizations
- **Risk Assessment**: HIGH/MEDIUM/LOW risk classifications with detailed reasoning
- **MongoDB Integration**: Persistent storage for transactions and alerts
- **RESTful API**: Complete backend API for all fraud detection operations

## 🏗️ Architecture

### Frontend
- **React 18** with TypeScript
- **Vite** build tool
- **TailwindCSS** + Radix UI components
- **React Router** for navigation
- **Recharts** for data visualization

### Backend
- **Node.js** with Express
- **MongoDB** for data persistence
- **JWT** authentication
- **CORS** enabled for cross-origin requests

### ML Service
- **Rule-based fraud detection** model
- **CSV preprocessing** and data cleaning
- **Automated pipeline** from upload to database storage
- **Aggressive fraud detection** with configurable thresholds

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or remote)
- npm or yarn

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/Tamilnilavan-K23/Hackgenix_fraud_detection.git
cd Hackgenix_fraud_detection
```

2. **Install dependencies**
```bash
# Backend
cd backend
npm install

# ML Service
cd ../ml
npm install

# Frontend
cd ../frontend/frontend
npm install
```

3. **Environment Configuration**
```bash
# Backend (.env)
MONGODB_URI=mongodb://localhost:27017/detectra
JWT_SECRET=your-jwt-secret
FRONTEND_URL=http://localhost:8080
ML_SERVICE_URL=http://localhost:5001

# ML Service (.env)
MONGODB_URI=mongodb://localhost:27017/detectra
PORT=5001
```

4. **Start all services**
```bash
# Use the provided startup script
./start-all.bat

# Or start individually:
# ML Service (Terminal 1)
cd ml && node src/index.js

# Backend (Terminal 2)
cd backend && npm start

# Frontend (Terminal 3)
cd frontend/frontend && npm run dev
```

## 🎯 Usage

1. **Access the application** at `http://localhost:8080`
2. **Upload CSV files** with transaction data
3. **View fraud detection results** with risk levels and reasoning
4. **Monitor dashboard** for fraud statistics and trends
5. **Review alerts** for high-risk transactions

## 📊 API Endpoints

### Backend API (Port 5000)
- `GET /health` - Health check
- `POST /api/upload` - Upload and process CSV files
- `GET /api/transactions` - Get transaction data
- `GET /api/alerts` - Get fraud alerts
- `GET /api/dashboard/stats` - Dashboard statistics

### ML Service API (Port 5001)
- `GET /health` - Health check
- `POST /process-csv` - Process CSV for fraud detection
- `GET /stats` - ML service statistics
- `GET /transactions` - Get processed transactions
- `GET /alerts` - Get fraud alerts

## 🔧 Configuration

### Fraud Detection Model
The ML service uses an aggressive rule-based model with configurable parameters:
- **Base fraud score**: 20% minimum risk
- **Amount thresholds**: >$100, >$500, >$1000
- **Time-based rules**: Night transactions (10pm-6am)
- **Category risks**: ATM, Online, E-commerce
- **Location factors**: Foreign transactions
- **Pattern detection**: Round numbers, unusual timing

### Risk Levels
- **HIGH**: ≥50% fraud probability
- **MEDIUM**: 30-49% fraud probability  
- **LOW**: <30% fraud probability

## 🗄️ Database Schema

### Transactions Collection
```javascript
{
  Transaction_ID: String,
  ml_pred_prob: Number,
  fraud_flag: Number (0/1),
  risk_level: String (HIGH/MEDIUM/LOW),
  reason: String,
  created_at: Date,
  updated_at: Date
}
```

### Alerts Collection
```javascript
{
  Transaction_ID: String,
  risk_level: String,
  reason: String,
  created_at: Date,
  updated_at: Date
}
```

## 🚀 Deployment

The application is ready for deployment with:
- Docker containerization support
- Environment-based configuration
- Production-ready logging
- Error handling and monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Tamilnilavan K**
- GitHub: [@Tamilnilavan-K23](https://github.com/Tamilnilavan-K23)

---

**Detectra - No Panic, Just Magic** ✨
