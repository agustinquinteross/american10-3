'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Save, Zap, Percent, Copy, Loader2, Tag } from 'lucide-react'

export default function AdminOfferForm({ onCancel, onSaved }) {
  const [loading, setLoading] = useState(false)
  
  // Estados para la lógica dinámica
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [offerType, setOfferType] = useState('nxm') // nxm, percent, second_unit
  
  // Variables dinámicas
  const [valN, setValN] = useState(2) // Llevás
  const [valM, setValM] = useState(1) // Pagás
  const [valPct, setValPct] = useState(50) // Porcentaje

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    // Generamos la etiqueta visual y el valor lógico automáticamente
    let finalValue = ''
    if (offerType === 'nxm') {
        finalValue = `${valN}x${valM}` // Ej: 3x2, 2x1, 4x3
    } else if (offerType === 'percent') {
        finalValue = `${valPct}% OFF`  // Ej: 20% OFF
    } else if (offerType === 'second_unit') {
        finalValue = `${valPct}% 2da`  // Ej: 70% 2da
    }

    const { error } = await supabase.from('special_offers').insert([{
        title: title,
        description: description,
        type: offerType, // 'nxm', 'percent' o 'second_unit'
        discount_value: finalValue, // Guarda el tag visual y lógico (Ej: "3x2")
        is_active: true 
    }])

    if (error) alert('Error al guardar: ' + error.message)
    else onSaved()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#FAF7F2]/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl border border-[#4A3B32]/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[#4A3B32]/10 flex justify-between items-center bg-[#FAF7F2]/40 shrink-0">
          <h2 className="font-black text-[#4A3B32] text-lg flex items-center gap-2 italic uppercase tracking-tighter">
            <Zap className="text-yellow-500" size={18}/> CREADOR DE OFERTAS
          </h2>
          <button onClick={onCancel} className="text-[#4A3B32]/70 hover:text-[#4A3B32] transition-colors"><X size={20}/></button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          <form id="offerForm" onSubmit={handleSubmit} className="space-y-6">
            
            {/* SELECTOR DINÁMICO DE TIPO */}
            <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setOfferType('nxm')} className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${offerType === 'nxm' ? 'bg-[#4A3B32] border-red-500 text-[#FAF7F2]' : 'bg-[#FAF7F2] border-[#4A3B32]/20 text-[#4A3B32]/70 hover:border-[#4A3B32]/40'}`}>
                    <Copy size={20}/> <span className="text-[10px] font-bold text-center leading-tight">Llevá N<br/>Pagá M</span>
                </button>
                <button type="button" onClick={() => setOfferType('percent')} className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${offerType === 'percent' ? 'bg-blue-600 border-blue-500 text-[#4A3B32]' : 'bg-[#FAF7F2] border-[#4A3B32]/20 text-[#4A3B32]/70 hover:border-[#4A3B32]/40'}`}>
                    <Percent size={20}/> <span className="text-[10px] font-bold text-center leading-tight">Descuento<br/>Directo</span>
                </button>
                <button type="button" onClick={() => setOfferType('second_unit')} className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${offerType === 'second_unit' ? 'bg-purple-600 border-purple-500 text-[#4A3B32]' : 'bg-[#FAF7F2] border-[#4A3B32]/20 text-[#4A3B32]/70 hover:border-[#4A3B32]/40'}`}>
                    <Tag size={20}/> <span className="text-[10px] font-bold text-center leading-tight">Dto. en<br/>2da Unidad</span>
                </button>
            </div>

            {/* CONFIGURADOR DINÁMICO */}
            <div className="bg-[#FAF7F2]/50 p-4 rounded-xl border border-[#4A3B32]/10 space-y-4">
                <h3 className="text-xs font-black text-[#4A3B32]/60 uppercase flex items-center gap-2 mb-2">
                   ⚙️ Regla de la Promoción
                </h3>
                
                {offerType === 'nxm' && (
                    <div className="flex items-center gap-4 justify-center">
                        <div className="text-center">
                            <label className="block text-[10px] font-bold text-[#4A3B32]/70 mb-1">El cliente LLEVA</label>
                            <input type="number" min="2" max="10" value={valN} onChange={e => setValN(e.target.value)} className="w-16 bg-white border border-[#4A3B32]/20 rounded-lg p-2 text-[#4A3B32] text-center font-black focus:border-red-500 outline-none" />
                        </div>
                        <span className="text-2xl font-black text-[#4A3B32]/50">X</span>
                        <div className="text-center">
                            <label className="block text-[10px] font-bold text-[#4A3B32]/70 mb-1">El cliente PAGA</label>
                            <input type="number" min="1" max="9" value={valM} onChange={e => setValM(e.target.value)} className="w-16 bg-white border border-[#4A3B32]/20 rounded-lg p-2 text-[#4A3B32] text-center font-black focus:border-red-500 outline-none" />
                        </div>
                    </div>
                )}

                {(offerType === 'percent' || offerType === 'second_unit') && (
                    <div>
                        <label className="block text-[10px] font-bold text-[#4A3B32]/70 mb-1">Porcentaje a descontar (%)</label>
                        <div className="relative w-1/2 mx-auto">
                            <Percent size={16} className="absolute left-3 top-2.5 text-[#4A3B32]/60" />
                            <input type="number" min="1" max="100" value={valPct} onChange={e => setValPct(e.target.value)} className="w-full pl-9 bg-white border border-[#4A3B32]/20 rounded-lg p-2 text-[#4A3B32] font-black focus:border-blue-500 outline-none" />
                        </div>
                        {offerType === 'second_unit' && <p className="text-[10px] text-[#4A3B32]/60 text-center mt-2 italic">Se aplicará el {valPct}% de descuento a la segunda unidad de cada par.</p>}
                    </div>
                )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-[#4A3B32]/60 mb-1 uppercase">Título de la Promo</label>
                <input required type="text" className="w-full bg-[#FAF7F2] border border-[#4A3B32]/20 rounded-xl p-3 text-[#4A3B32] focus:border-yellow-500 outline-none text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Especial Día del Amigo" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-[#4A3B32]/60 mb-1 uppercase">Descripción</label>
                <input required type="text" className="w-full bg-[#FAF7F2] border border-[#4A3B32]/20 rounded-xl p-3 text-[#4A3B32] focus:border-yellow-500 outline-none text-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Llevate 3 burgers pagando solo 2." />
              </div>
            </div>
            
            {/* VISTA PREVIA DE LA ETIQUETA */}
            <div className="flex justify-between items-center bg-yellow-900/10 border border-yellow-900/30 p-3 rounded-lg">
                <span className="text-[10px] font-bold text-[#4A3B32]/60 uppercase">Etiqueta Generada:</span>
                <span className="bg-yellow-500 text-black font-black text-[10px] uppercase px-2 py-1 rounded shadow-lg">
                    {offerType === 'nxm' ? `${valN}x${valM}` : offerType === 'percent' ? `${valPct}% OFF` : `${valPct}% 2da`}
                </span>
            </div>

          </form>
        </div>

        <div className="p-4 border-t border-[#4A3B32]/10 bg-[#FAF7F2]/40 shrink-0">
            <button form="offerForm" type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-500 text-[#4A3B32] py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin" size={20}/> : <><Save size={20}/> GUARDAR PROMOCIÓN</>}
            </button>
        </div>
      </div>
    </div>
  )
}