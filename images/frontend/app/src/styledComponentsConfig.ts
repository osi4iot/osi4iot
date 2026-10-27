import isPropValid from '@emotion/is-prop-valid';

// styled-components v6 ya no filtra las props personalizadas antes de pasarlas al DOM.
// Se restablece el comportamiento de v5: a los elementos HTML solo llegan los atributos válidos,
// y a los componentes React les llegan todas las props.
export function shouldForwardProp(propName: string, target: unknown): boolean {
  if (typeof target === 'string') return isPropValid(propName);
  return true;
}
