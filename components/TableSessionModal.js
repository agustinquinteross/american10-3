'use client'
import { useState, useEffect } from 'react'
import { X, Plus, Printer, Check, DollarSign, Utensils, List, Coffee, Trash2, Send, ChevronRight, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AdminProductOptionSelector from './AdminProductOptionSelector'
import AdminSessionReceipt from './AdminSessionReceipt'
import WaiterLogin from './WaiterLogin'

export default function TableSessionModal({ table, products, onClose, onRefresh, loggedWaiter = null }) {
    const [loading, setLoading] = useState(true)
    const [session, setSession] = useState(null)
    const [sessionOrders, setSessionOrders] = useState([])
    const [cart, setCart] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedProductForOptions, setSelectedProductForOptions] = useState(null)
    const [modifierGroups, setModifierGroups] = useState([])
    const [isCheckingOut, setIsCheckingOut] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState('EFECTIVO')
    const [discount, setDiscount] = useState(0)
    const [showAddMenu, setShowAddMenu] = useState(false)
    const [showReceipt, setShowReceipt] = useState(false)
    const [waiter, setWaiter] = useState(loggedWaiter)
    const [showWaiterSelection, setShowWaiterSelection] = useState(false)

    useEffect(() => {
        if (loggedWaiter) setWaiter(loggedWaiter)
    }, [loggedWaiter])

    useEffect(() => {
        const activeSessionId = table?.active_session_id || session?.id
        
        if (activeSessionId) {
            fetchSessionData(activeSessionId)
        } else {
            setLoading(false)
            setSession(null)
            setSessionOrders([])
        }

        // --- REALTIME SUBSCRIPTION ---
        if (!activeSessionId) return

        const channel = supabase
            .channel(`session_${activeSessionId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'table_sessions', 
                filter: `id=eq.${activeSessionId}` 
            }, () => fetchSessionData(activeSessionId))
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'orders', 
                filter: `session_id=eq.${activeSessionId}` 
            }, () => fetchSessionData(activeSessionId))
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'order_items' 
            }, () => fetchSessionData(activeSessionId))
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [table.id, table.active_session_id])

    const fetchSessionData = async (explicitId = null) => {
        const sessionId = explicitId || session?.id || table.active_session_id
        if (!sessionId) {
            return
        }
        
        const { data: sessionData, error: sError } = await supabase.from('table_sessions').select('*, waiters(name)').eq('id', sessionId).single()
        const { data: ordersData, error: oError } = await supabase.from('orders').select('*, order_items(*)').eq('session_id', sessionId).order('created_at', { ascending: false })
        
        if (sError) console.error('Error fetching session:', sError)
        if (oError) console.error('Error fetching orders:', oError)

        if (sessionData) {
            setSession(sessionData)
            if (sessionData.waiters) setWaiter(sessionData.waiters)
            // Si la mesa se cerró externamente (e.g. desde admin), cerramos aquí también si el status es closed
            if (sessionData.status === 'closed') {
                onClose()
                onRefresh()
            }
        } else if (!sError) {
            // Si no hay datos y no hubo error, la sesión podría haber sido eliminada
            setSession(null)
            setSessionOrders([])
        }

        if (ordersData) setSessionOrders(ordersData)
        setLoading(false)
    }

    const fetchModifiers = async (productId) => {
        const { data } = await supabase.from('product_modifiers').select('*, modifier_groups(*, modifier_options(*))').eq('product_id', productId)
        setModifierGroups(data?.map(m => m.modifier_groups) || [])
    }

    const openSession = async (waiterObj) => {
        setLoading(true)
        const activeWaiter = waiterObj || waiter
        if (!activeWaiter) {
            setShowWaiterSelection(true)
            setLoading(false)
            return
        }

        const { data, error } = await supabase.from('table_sessions').insert({ 
            table_id: table.id,
            waiter_id: activeWaiter.id
        }).select().single()
        
        if (!error && data) {
            await supabase.from('restaurant_tables').update({ status: 'ocupada', active_session_id: data.id }).eq('id', table.id)
            setShowWaiterSelection(false)
            setWaiter(activeWaiter)
            onRefresh()
            fetchSessionData(data.id)
        } else {
            setLoading(false)
            if (error) alert('Error al abrir mesa: ' + error.message)
        }
    }

    const addToCart = (product, optionsText = '', extraPrice = 0, itemNote = '') => {
        const cartItem = {
            id: Date.now(),
            product_id: product.id,
            product_name: product.name,
            quantity: 1,
            price: product.price + extraPrice,
            options: optionsText,
            internal_notes: itemNote
        }
        setCart(prev => [...prev, cartItem])
        setShowAddMenu(false)
    }

    const removeFromCart = (id) => {
        setCart(prev => prev.filter(item => item.id !== id))
    }

    const confirmOrderToKitchen = async () => {
        if (cart.length === 0) return
        if (!session) {
            alert('No hay sesión activa para esta mesa.')
            return
        }
        
        setLoading(true)
        const batchTotal = cart.reduce((acc, item) => acc + item.price, 0)
        
        const newOrder = {
            customer_name: `MESA ${table.label}`,
            customer_phone: 'S/N',
            total: batchTotal,
            status: 'pending',
            delivery_method: 'mesa',
            session_id: session.id,
            table_label: table.label,
            payment_method: 'EFECTIVO'
        }

        const { data: order, error: orderError } = await supabase.from('orders').insert(newOrder).select().single()
        
        if (orderError) {
            alert('Error al crear pedido: ' + orderError.message)
            setLoading(false)
            return
        }

        const orderItems = cart.map(item => ({
            order_id: order.id,
            product_name: item.product_name,
            quantity: item.quantity,
            price: item.price,
            options: item.options,
            internal_notes: item.internal_notes
        }))

        const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
        
        if (itemsError) {
            alert('Error al agregar items: ' + itemsError.message)
        } else {
            const newTotal = (session.total || 0) + batchTotal
            await supabase.from('table_sessions').update({ total: newTotal }).eq('id', session.id)
            setCart([])
            await fetchSessionData()
        }
        setLoading(false)
    }

    const deleteConfirmedItem = async (orderId) => {
        if (!confirm('¿Estás seguro de eliminar este pedido?')) return
        setLoading(true)
        
        // Obtenemos el total del pedido para restarlo de la sesión
        const orderToDelete = sessionOrders.find(o => o.id === orderId)
        if (!orderToDelete) return
        
        const { error } = await supabase.from('orders').delete().eq('id', orderId)
        
        if (!error) {
            const newTotal = Math.max(0, (session.total || 0) - orderToDelete.total)
            await supabase.from('table_sessions').update({ total: newTotal }).eq('id', session.id)
            await fetchSessionData()
        } else {
            alert('Error al eliminar: ' + error.message)
        }
        setLoading(false)
    }

    const closeSession = async () => {
        setLoading(true)
        const finalTotal = totalAcumulado - discount
        const { error } = await supabase.from('table_sessions').update({ 
            status: 'closed', 
            closed_at: new Date().toISOString(),
            payment_method: paymentMethod,
            discount: discount,
            total: finalTotal
        }).eq('id', session.id)
        
        if (!error) {
            await supabase.from('restaurant_tables').update({ status: 'libre', active_session_id: null }).eq('id', table.id)
            onClose()
            onRefresh()
        } else {
            alert('Error al cerrar: ' + error.message)
            setLoading(false)
        }
    }

    const requestAccount = async () => {
        const { error } = await supabase.from('restaurant_tables').update({ status: 'cuenta_pedida' }).eq('id', table.id)
        if (!error) {
            onRefresh()
            fetchSessionData()
        }
    }

    const totalAcumulado = sessionOrders.reduce((acc, order) => acc + order.total, 0)
    const cartTotal = cart.reduce((acc, item) => acc + item.price, 0)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm">
            <div className="w-full md:w-[500px] h-screen bg-[#0A0A0A] border-l border-white/10 flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#1A1A1A]">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-[#E31B23]/20 text-[#E31B23] rounded-xl">
                            <Coffee size={20}/>
                        </div>
                        <div>
                            <h2 className="font-black text-lg uppercase tracking-tighter">{table.label}</h2>
                            <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">{table.restaurant_zones?.name || 'Local'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-white/40">
                        <X size={20}/>
                    </button>
                </div>

                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <div className="w-12 h-12 border-4 border-[#E31B23] border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs font-black uppercase tracking-widest text-white/40">Procesando...</p>
                    </div>
                ) : !session ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center pointer-events-auto">
                        {showWaiterSelection ? (
                            <WaiterLogin onLogin={openSession} />
                        ) : (
                            <>
                                <Utensils size={64} className="mb-6 text-white/5"/>
                                <h3 className="text-xl font-black mb-2 uppercase italic tracking-tighter text-[#E31B23]">Mesa Vacía</h3>
                                <p className="text-sm text-white/40 mb-8">No hay una cuenta activa en esta mesa.</p>
                                <button 
                                    onClick={() => openSession()}
                                    className="w-full bg-[#E31B23] py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(227,27,35,0.3)] hover:scale-105 active:scale-95 transition-all text-white"
                                >
                                    Abrir Mesa Nueva
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Contenido de la Sesión */}
                        <div className="flex-1 overflow-y-auto p-4 dash-scroll space-y-6">
                            
                            {/* 🛒 CARRITO LOCAL (NUEVO) */}
                            {cart.length > 0 && (
                                <div className="space-y-3 p-4 bg-[#E31B23]/5 border border-[#E31B23]/20 rounded-3xl animate-in slide-in-from-top duration-300">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-[10px] font-black text-[#E31B23] uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Utensils size={12}/> Pedido Nuevo (Por enviar)
                                        </h3>
                                        <span className="text-xs font-black text-white">${cartTotal}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {cart.map(item => (
                                            <div key={item.id} className="flex justify-between items-center gap-3 bg-black/40 p-3 rounded-2xl border border-white/5">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-white uppercase">{item.product_name}</p>
                                                    {item.options && <p className="text-[9px] text-white/40 italic truncate">{item.options}</p>}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-black text-[#E31B23]">${item.price}</span>
                                                    <button onClick={() => removeFromCart(item.id)} className="p-1.5 text-white/20 hover:text-red-500 transition-colors">
                                                        <Trash2 size={14}/>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={confirmOrderToKitchen}
                                        className="w-full bg-[#E31B23] py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[#E31B23]/20 hover:scale-[1.02] active:scale-98 transition-all text-white"
                                    >
                                        <Send size={14}/> Enviar a Cocina (${cartTotal})
                                    </button>
                                </div>
                            )}

                            {/* Resumen de Consumo Confirmado */}
                            <div className="space-y-3">
                                <h3 className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <List size={10}/> Consumo Confirmado
                                </h3>
                                {sessionOrders.length === 0 ? (
                                    <div className="p-8 border-2 border-dashed border-white/5 rounded-3xl text-center">
                                        <p className="text-xs text-white/20 font-bold italic">Nada pedido aún...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {sessionOrders.map(order => (
                                            <div key={order.id} className="bg-white/5 border border-white/10 rounded-2xl p-3 relative group">
                                                <div className="flex justify-between items-center mb-1.5 border-b border-white/5 pb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black text-[#E31B23]">#{order.id.toString().slice(-4)}</span>
                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase ${
                                                            order.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' : 
                                                            order.status === 'cooking' ? 'bg-red-500/10 text-red-500' : 
                                                            'bg-green-500/10 text-green-500'
                                                        }`}>
                                                            {order.status}
                                                        </span>
                                                    </div>
                                                    <button 
                                                        onClick={() => deleteConfirmedItem(order.id)}
                                                        className="p-1 text-white/10 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <XCircle size={14}/>
                                                    </button>
                                                </div>
                                                <div className="space-y-1.5">
                                                    {order.order_items.map(item => (
                                                        <div key={item.id} className="space-y-1">
                                                            <div className="flex justify-between items-center text-[11px] font-bold">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[#E31B23]">{item.quantity}x</span>
                                                                    <span className="text-white/80 truncate max-w-[150px]">{item.product_name}</span>
                                                                </div>
                                                                <span>${item.price * item.quantity}</span>
                                                            </div>
                                                            {item.options && <p className="text-[9px] text-white/30 italic ml-4 leading-tight">{item.options}</p>}
                                                            {item.internal_notes && <p className="text-[9px] text-yellow-500 italic mt-0.5 bg-yellow-400/5 px-1.5 py-0.5 rounded border border-yellow-400/10 line-clamp-1">📝 {item.internal_notes}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer con Acciones */}
                        <div className="p-4 bg-[#1A1A1A] border-t border-white/10 space-y-3 shrink-0">
                            <div className="flex justify-between items-end mb-1">
                                <div>
                                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none">Total Consolidado</p>
                                    <p className="text-[8px] font-bold text-white/20 uppercase mt-1">Suma de consumos enviados</p>
                                </div>
                                <span className="text-2xl font-black text-white italic tracking-tighter">${totalAcumulado}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={() => setShowAddMenu(true)}
                                    className="bg-white/5 border border-white/10 h-11 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-colors text-white"
                                >
                                    <Plus size={16}/> Agregar Mas
                                </button>
                                <button 
                                    onClick={requestAccount}
                                    className={`bg-white/5 border border-white/10 h-11 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all text-white
                                        ${table.status === 'cuenta_pedida' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/40' : 'hover:bg-white/10'}`}
                                >
                                    <DollarSign size={16}/> {table.status === 'cuenta_pedida' ? 'Cuenta Pedida' : 'Pedir Cuenta'}
                                </button>
                                <button 
                                    onClick={() => setShowReceipt(true)}
                                    className="bg-white/5 border border-white/10 h-11 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-colors text-white"
                                >
                                    <Printer size={16}/> Ticket PDF
                                </button>
                                <button 
                                    onClick={() => setIsCheckingOut(true)}
                                    className="col-span-2 bg-green-600 h-11 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-white"
                                >
                                    <Check size={18}/> Cerrar y Cobrar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Sub-Panel: Seleccionador de Productos */}
            {showAddMenu && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="w-full max-w-2xl bg-[#0A0A0A] border border-white/10 rounded-[32px] shadow-2xl overflow-hidden flex flex-col h-[80vh] animate-in zoom-in-95 duration-300">
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#1A1A1A]">
                            <h3 className="font-black text-lg italic tracking-tighter uppercase text-white">Menú de Salón</h3>
                            <button onClick={() => setShowAddMenu(false)} className="p-1.5 bg-white/5 rounded-full text-white/40"><X size={20}/></button>
                        </div>
                        <div className="p-3 border-b border-white/10">
                            <input 
                                type="text" 
                                placeholder="Buscar plato o bebida..." 
                                className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-[#E31B23] text-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 dash-scroll">
                            {products
                                .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) && p.is_active)
                                .map(product => (
                                    <div 
                                        key={product.id} 
                                        onClick={() => {
                                            fetchModifiers(product.id)
                                            setSelectedProductForOptions(product)
                                        }}
                                        className="bg-[#1A1A1A] border border-white/10 p-3 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-[#E31B23] transition-all"
                                    >
                                        <div className="w-12 h-12 bg-black rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-xl">
                                            {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover"/> : '🍕'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-xs truncate uppercase text-white/80">{product.name}</h4>
                                            <p className="text-base font-black text-[#E31B23] italic">${product.price}</p>
                                        </div>
                                        <button className="p-2 bg-white/5 rounded-full text-[#E31B23]"><Plus size={16}/></button>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Sub-Panel 2: Selector de Opciones */}
            {selectedProductForOptions && (
                <AdminProductOptionSelector 
                    product={selectedProductForOptions}
                    modifierGroups={modifierGroups}
                    onClose={() => setSelectedProductForOptions(null)}
                    onConfirm={(prod, opt, price, note) => {
                        addToCart(prod, opt, price, note)
                        setSelectedProductForOptions(null)
                    }}
                />
            )}

            {/* Ticket */}
            {showReceipt && (
                <AdminSessionReceipt 
                    session={session}
                    orders={sessionOrders}
                    onClose={() => setShowReceipt(false)}
                />
            )}

            {/* Checkout */}
            {isCheckingOut && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
                    <div className="w-full max-w-md bg-[#111111] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#1A1A1A]">
                            <h3 className="font-black text-xl italic tracking-tighter uppercase text-white">Finalizar Mesa</h3>
                            <button onClick={() => setIsCheckingOut(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/40"><X size={24}/></button>
                        </div>
                        
                        <div className="p-8 space-y-6">
                            <div className="text-center">
                                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-1">Total a cobrar</p>
                                <p className="text-5xl font-black text-white italic tracking-tighter">${totalAcumulado - discount}</p>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Método de Pago</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['EFECTIVO', 'TARJETA', 'M.PAGO'].map(method => (
                                        <button 
                                            key={method}
                                            onClick={() => setPaymentMethod(method)}
                                            className={`py-3 rounded-2xl font-black text-[10px] transition-all border ${paymentMethod === method ? 'bg-[#E31B23] border-[#E31B23] text-white shadow-lg' : 'bg-white/5 border-white/10 text-white/40'}`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Descuento ($)</label>
                                <input 
                                    type="number" 
                                    className="w-full bg-black border border-white/10 rounded-2xl px-6 py-3 text-white outline-none focus:border-[#E31B23] font-bold text-center text-xl"
                                    value={discount}
                                    onChange={(e) => setDiscount(Number(e.target.value))}
                                />
                            </div>

                            <div className="bg-white/5 p-4 rounded-[24px] border border-white/5 space-y-2">
                                <div className="flex justify-between text-xs font-bold text-white/40"><span>Subtotal</span><span>${totalAcumulado}</span></div>
                                <div className="flex justify-between text-xs font-bold text-[#E31B23]"><span>Descuento</span><span>-${discount}</span></div>
                                <div className="flex justify-between text-lg font-black text-white pt-2 border-t border-white/10 italic"><span>TOTAL</span><span>${totalAcumulado - discount}</span></div>
                            </div>

                            <button 
                                onClick={closeSession}
                                className="w-full bg-green-600 py-4 rounded-[20px] font-black text-sm uppercase tracking-widest shadow-xl text-white hover:scale-[1.02] active:scale-98 transition-all"
                            >
                                Confirmar y Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
