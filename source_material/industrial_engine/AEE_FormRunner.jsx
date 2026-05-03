import React, { useState } from 'react';
import { IndraIcon } from '../../utilities/IndraIcons';
import { DataProjector } from '../../../services/DataProjector';
import { useLexicon } from '../../../services/lexicon';

import { getComponentForNode } from './ComponentMapper';

import { useIndraResource } from '../../../hooks/useIndraResource';

const StaticImageRenderer = ({ field, isDesignMode, onUpdate }) => {
    const { url, isLoading } = useIndraResource(field.label);

    if (isDesignMode) {
        return (
            <div className="stack--tight glass-light center" style={{ padding: '32px', border: '1px dashed var(--color-border)', position: 'relative' }}>
                <IndraIcon name={isLoading ? 'SYNC' : 'IMAGE'} size="24px" style={{ opacity: 0.5 }} className={isLoading ? 'spin' : ''} />
                <input 
                    className="input-base" 
                    style={{ width: '80%', textAlign: 'center', fontSize: '10px' }} 
                    defaultValue={field.label} 
                    placeholder="GRID (indra://...) o URL de imagen" 
                    onBlur={(e) => onUpdate?.(e.target.value)}
                />
                {url && url !== field.label && (
                    <img src={url} alt="Preview" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.2, zIndex: -1 }} />
                )}
            </div>
        );
    }

    if (isLoading) {
        return <div className="center fill" style={{ padding: '32px', opacity: 0.5 }}><IndraIcon name="SYNC" className="spin" /></div>;
    }

    return (
        <div className="center fill">
            {url ? (
                <img src={url} alt="Asset" style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-md)' }} />
            ) : (
                <div style={{ padding: '20px', border: '1px dashed var(--color-danger)', color: 'var(--color-danger)', fontSize: '10px' }}>RECURSO NO ENCONTRADO</div>
            )}
        </div>
    );
};

/**
 * Componente Recursivo para renderizar nodos del esquema.
 */
function FormNode({ field, value, onChange, disabled, isDesignMode, bridge }) {
    const isFrame = field.type === 'FRAME';
    const isRepeater = field.type === 'REPEATER';
    const isStaticText = field.type === 'STATIC_TEXT';
    const isStaticImage = field.type === 'STATIC_IMAGE';
    const isSiloShareCreator = field.type === 'SILO_SHARE_CREATOR';
    const t = useLexicon();
    const [isHovered, setIsHovered] = useState(false);

    const handleRemove = (e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('AEE_REMOVE_FIELD', { detail: { id: field.id } }));
    };

    const Wrapper = ({ children }) => (
        <div 
            className="aee-field-wrapper stack--tight" 
            style={{ position: 'relative', width: '100%', outline: isDesignMode && isHovered ? '2px dashed var(--color-border-strong)' : 'none', padding: isDesignMode && isHovered ? '4px' : '0' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {isDesignMode && isHovered && (
                <button 
                    className="btn btn--xs btn--danger" 
                    onClick={handleRemove}
                    style={{ position: 'absolute', top: '-10px', right: '-10px', zIndex: 10, padding: '4px', borderRadius: '50%' }}
                    title="ELIMINAR_DEL_LIENZO"
                >
                    <IndraIcon name="CLOSE" size="8px" />
                </button>
            )}
            {children}
        </div>
    );

    // ── RENDERIZADO DE CONTENEDORES Y REPETIDORES RECURSIVOS (Ignorado en brevedad parcial, usar lógica original) ──
    if (isFrame) {
        return (
            <Wrapper>
                <div className="indra-container">
                    <div className="indra-header-label" style={{ opacity: 0.7 }}>{t('ui_group')}::{field.alias.toUpperCase()}</div>
                    <div className="node-body grid-split--tight" style={{ padding: 'var(--space-4) var(--space-3)' }}>
                        {field.children?.map(child => (
                            <FormNode
                                key={child.id}
                                field={child}
                                value={value?.[child.alias]}
                                onChange={(alias, val) => onChange(field.alias, { ...value, [alias]: val })}
                                disabled={disabled}
                                isDesignMode={isDesignMode}
                                bridge={bridge}
                            />
                        ))}
                    </div>
                </div>
            </Wrapper>
        );
    }

    if (isRepeater) {
        const items = Array.isArray(value) ? value : [];
        const addItem = () => {
            const newItem = {};
            field.children?.forEach(c => newItem[c.alias] = null);
            onChange(field.alias, [...items, newItem]);
        };
        const removeItem = (index) => {
            onChange(field.alias, items.filter((_, i) => i !== index));
        };
        const updateItem = (index, itemValue) => {
            const newItems = [...items];
            newItems[index] = itemValue;
            onChange(field.alias, newItems);
        };

        return (
            <Wrapper>
                <div className="indra-container" style={{ background: 'var(--color-bg-void)' }}>
                    <div className="indra-header-label" style={{ background: 'var(--color-warm)', color: 'black' }}>{t('ui_list')}::{field.alias.toUpperCase()}</div>
                    <div style={{ padding: 'var(--space-3)' }}>
                        <header className="node-header shelf--between" style={{ marginBottom: 'var(--space-2)' }}>
                            <span className="util-label" style={{ fontSize: '10px' }}>{field.label}</span>
                            <button 
                                className="btn btn--xs" onClick={addItem} disabled={disabled}
                                style={{ borderRadius: '4px', border: '1px solid var(--indra-dynamic-accent)', color: 'var(--indra-dynamic-accent)', background: 'var(--indra-dynamic-bg)', fontSize: '8px', padding: '1px 8px' }}
                            >
                                <IndraIcon name="PLUS" size="8px" color="var(--indra-dynamic-accent)" />
                                <span style={{ marginLeft: '4px' }}>{t('action_add_item')}</span>
                            </button>
                        </header>
                        <div className="repeater-list stack--tight" style={{ gap: 'var(--indra-ui-gap)' }}>
                            {items.length > 0 ? items.map((item, idx) => (
                                <div key={idx} className="indra-container shelf--tight" style={{ background: 'var(--color-bg-deep)', padding: 'var(--space-2)' }}>
                                    <div className="item-content grid-split--tight fill">
                                        {field.children?.map(child => (
                                            <FormNode
                                                key={child.id}
                                                field={child}
                                                value={item[child.alias]}
                                                onChange={(alias, val) => updateItem(idx, { ...item, [alias]: val })}
                                                disabled={disabled}
                                                isDesignMode={isDesignMode}
                                                bridge={bridge}
                                            />
                                        ))}
                                    </div>
                                    <button className="btn btn--xs btn--danger btn--icon" onClick={() => removeItem(idx)} disabled={disabled}>
                                        <IndraIcon name="CLOSE" size="8px" color="var(--color-danger)" />
                                    </button>
                                </div>
                            )) : (
                                <p className="util-hint center" style={{ padding: '10px', fontSize: '9px', opacity: 0.4 }}>{t('status_empty_list')}</p>
                            )}
                        </div>
                    </div>
                </div>
            </Wrapper>
        );
    }

    // ── RENDERIZADO ESTÁTICO DE DISEÑO ──
    if (isStaticText) {
        return (
            <Wrapper>
                <div style={{ width: '100%', color: 'var(--color-text-primary)' }}>
                    {isDesignMode ? (
                        <textarea 
                            className="input-base stack fill"
                            style={{ background: 'transparent', border: 'none', resize: 'none', fontFamily: 'var(--font-system)', fontSize: '14px', lineHeight: '1.5', padding: '8px' }}
                            defaultValue={field.label}
                            onBlur={(e) => {
                                window.dispatchEvent(new CustomEvent('AEE_UPDATE_FIELD', { detail: { id: field.id, label: e.target.value } }));
                            }}
                        />
                    ) : (
                        <div style={{ fontFamily: 'var(--font-system)', fontSize: '14px', lineHeight: '1.5', padding: '8px', whiteSpace: 'pre-line' }}>
                            {field.label}
                        </div>
                    )}
                </div>
            </Wrapper>
        );
    }

    if (isStaticImage) {
        return (
            <Wrapper>
                <StaticImageRenderer 
                    field={field} 
                    isDesignMode={isDesignMode} 
                    onUpdate={(newUrl) => {
                        window.dispatchEvent(new CustomEvent('AEE_UPDATE_FIELD', { detail: { id: field.id, label: newUrl } }));
                    }}
                />
            </Wrapper>
        );
    }

    // ── RENDERIZADO DE CAMPO ATÓMICO (MAPPING DINÁMICO) ──
    const Widget = getComponentForNode(field);
    return (
        <Wrapper>
            <Widget 
                field={field} 
                value={value} 
                onChange={(alias, val) => onChange(alias, val)}
                disabled={disabled}
                bridge={bridge}
            />
        </Wrapper>
    );
}

export function FormRunner({ schema, formData, onFieldChange, onExecute, status, customButtonLabel, customButtonVariant, isDesignMode, bridge }) {
    const t = useLexicon();

    // Lógica para Canvas Libre: Priorizamos los campos seleccionados en el Micro-Explorador.
    const customFields = schema?.payload?.custom_fields || [];
    const baseFields = schema?.payload?.fields || [];
    
    const fieldsToProject = customFields.length > 0 ? customFields : baseFields;

    // Engaño cognitivo: forzamos a Projector a trabajar con el Lienzo Personalizado
    const projection = DataProjector.projectSchema({
        ...schema,
        payload: {
            ...schema?.payload,
            fields: fieldsToProject
        }
    });
    
    const fields = projection.fields || [];
    
    // Resolvemos la estética en vivo
    const label = customButtonLabel || (status === 'EXECUTING' ? t('status_executing') : t('action_execute'));
    const variantClass = customButtonVariant ? `btn--${customButtonVariant}` : 'btn--accent';

    return (
        <div className="aee-form-runner__form stack--loose" style={{ color: 'var(--color-text-primary)'}}>
            <header className="form-header stack--tight">
                <div className="shelf--tight">
                    <IndraIcon name="LAYOUT" size="12px" style={{ color: 'var(--indra-dynamic-accent)' }} />
                    <span className="util-label">LIENZO AEE CONFIGURABLE</span>
                </div>
                {/* <h2>{projection.label || 'Módulo Generado'}</h2> // Removed as Canvas is supposed to be clean */}
                <p className="util-hint" style={{ opacity: 0.6 }}>Esta micro-aplicación reacciona de forma agnóstica a tu composición geométrica.</p>
            </header>

            <section className="form-grid stack--loose">
                {fields.length > 0 ? (
                    fields.map(field => (
                        <FormNode
                            key={field.id}
                            field={field}
                            value={formData[field.alias]}
                            onChange={onFieldChange}
                            disabled={status === 'EXECUTING'}
                            isDesignMode={isDesignMode}
                            bridge={bridge}
                        />
                    ))
                ) : (
                    <div className="empty-state center stack--tight slot-small" style={{ opacity: 0.5 }}>
                        <IndraIcon name="WARN" size="24px" />
                        <span className="util-label">ESQUEMA VACÍO</span>
                        <p className="util-hint" style={{ fontSize: '9px' }}>El contrato de datos no define campos de entrada.</p>
                    </div>
                )}
            </section>

            <footer className="form-actions shelf" style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
                <button
                    className={`btn ${variantClass} ${status === 'EXECUTING' ? 'active' : ''}`}
                    onClick={onExecute}
                    disabled={status === 'EXECUTING' || fields.length === 0}
                    style={{ width: '100%', justifyContent: 'center', padding: '12px', letterSpacing: '0.1em' }}
                >
                    <IndraIcon name={status === 'EXECUTING' ? 'SYNC' : (customButtonLabel ? 'BOLT' : 'PLAY')} className={status === 'EXECUTING' ? 'spin' : ''} />
                    <span className="font-mono" style={{ fontSize: '10px' }}>{label}</span>
                </button>
            </footer>
        </div>
    );
}
