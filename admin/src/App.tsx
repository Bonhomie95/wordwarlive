import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import { Loading } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import PlayerDetail from './pages/PlayerDetail';
import Leaderboard from './pages/Leaderboard';
import Matches from './pages/Matches';
import Reports from './pages/Reports';
import Economy from './pages/Economy';
import Iap from './pages/Iap';
import Audit from './pages/Audit';

export default function App() {
    const { me, loading } = useAuth();

    if (loading) {
        return (
            <div className="center-screen">
                <Loading label="Checking session…" />
            </div>
        );
    }

    if (!me) {
        return (
            <Routes>
                <Route path="*" element={<Login />} />
            </Routes>
        );
    }

    return (
        <Routes>
            <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/players" element={<Players />} />
                <Route path="/players/:id" element={<PlayerDetail />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/matches" element={<Matches />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/economy" element={<Economy />} />
                <Route path="/iap" element={<Iap />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}
