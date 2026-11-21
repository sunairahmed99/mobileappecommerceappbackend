import mongoose from 'mongoose';

// Reserve references atomically using MongoDB's unique _id index.
const schema = new mongoose.Schema({ _id: { type: String, required: true } }, { versionKey: false });
export default mongoose.model('OrderReference', schema);
