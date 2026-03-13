'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import WaiterLogin from '../../components/WaiterLogin'
import AdminTableMap from '../../components/AdminTableMap'
import TableSessionModal from '../../components/TableSessionModal'
import { LogOut, Coffee, Map as MapIcon, RefreshCw, Smartphone } from 'lucide-react'

export default function MozoPage() {
    const [waiter, setWaiter] = useState(null)
    const [zones, setZones] = useState([])
    const [tables, setTables] = useState([])
    const [products, setProducts] = useState([])
    const [selectedTable, setSelectedTable] = useState(null)
    const [loading, setLoading] = useState(true)
    const [designMode, setDesignMode] = useState(false) // Siempre false para mozos

    useEffect(() => {
        // Cargar datos básicos
        loadData()
        
        // Mantener sesión de mozo localmente
        const savedWaiter = localStorage.getItem('active_waiter')
        if (savedWaiter) setWaiter(JSON.parse(savedWaiter))

        // --- REALTIME TABLES ---
        const channel = supabase
            .channel('map_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
                loadData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, () => {
                loadData()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const loadData = async (showLoading = true) => {
        if (showLoading) setLoading(true)
        const [zData, tData, pData] = await Promise.all([
            supabase.from('restaurant_zones').select('*'),
            supabase.from('restaurant_tables').select('*, restaurant_zones(name)'),
            supabase.from('products').select('*').eq('is_active', true)
        ])
        
        const newTables = tData.data || []
        setZones(zData.data || [])
        setTables(newTables)
        setProducts(pData.data || [])
        setLoading(false)
    }

    const handleLogin = (waiterObj) => {
        setWaiter(waiterObj)
        localStorage.setItem('active_waiter', JSON.stringify(waiterObj))
    }

    const handleLogout = () => {
        setWaiter(null)
        localStorage.removeItem('active_waiter')
    }

    if (!waiter) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
                <div className="w-full max-w-sm">
                    <div className="flex flex-col items-center mb-8 gap-3">
                        <Smartphone size={48} className="text-[#E31B23] animate-pulse"/>
                        <h1 className="text-xl font-black italic uppercase tracking-tighter">American Mozo v2.0</h1>
                    </div>
                    <WaiterLogin onLogin={handleLogin} />
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col h-screen overflow-hidden">
            {/* Header Mozo */}
            <nav className="bg-[#1A1A1A] border-b border-white/10 p-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#E31B23] rounded-full flex items-center justify-center font-black text-sm shadow-lg shadow-[#E31B23]/20">
                        {waiter.name[0]}
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">Mozo Activo</p>
                        <p className="font-bold text-sm uppercase">{waiter.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={loadData} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/>
                    </button>
                    <button onClick={handleLogout} className="p-3 bg-white/5 rounded-2xl hover:bg-[#E31B23]/20 text-white/40 hover:text-[#E31B23] transition-colors">
                        <LogOut size={20}/>
                    </button>
                </div>
            </nav>

            <main className="flex-1 overflow-hidden relative p-4 flex flex-col">
                <div className="flex-1 flex flex-col min-h-0 bg-[#121212] rounded-[32px] border border-white/5 overflow-hidden">
                    <AdminTableMap 
                        zones={zones}
                        tables={tables}
                        designMode={false}
                        setDesignMode={() => {}} // Deshabilitado para mozos
                        onTableClick={(table) => setSelectedTable(table)}
                        onRefresh={loadData}
                        onShowManagement={() => {}} // Deshabilitado
                    />
                </div>
            </main>

            {/* Footer Informativo */}
            <div className="p-4 bg-black/40 border-t border-white/5 flex justify-around items-center shrink-0">
                <div className="flex flex-col items-center opacity-40">
                    <Coffee size={20}/>
                    <span className="text-[8px] font-black uppercase mt-1">Salón</span>
                </div>
                <div className="flex flex-col items-center text-[#E31B23]">
                    <MapIcon size={20}/>
                    <span className="text-[8px] font-black uppercase mt-1 tracking-widest">Mesas</span>
                </div>
            </div>

            {/* Modal de Sesión (El mismo que el admin, pero cargado aquí) */}
            {selectedTable && (
                <TableSessionModal 
                    table={selectedTable}
                    products={products}
                    onClose={() => setSelectedTable(null)}
                    onRefresh={loadData}
                    loggedWaiter={waiter}
                />
            )}
        </div>
    )
}
