import type { ImageSourcePropType } from 'react-native';

/** Um movimento do guia de mobilidade. */
export interface MovimentoDeMobilidade {
  nome: string;
  foco: string;
  como: string;
  imagem: ImageSourcePropType;
}

/**
 * Os movimentos que os pacotes podem citar em `pack_runs.guide_keys`.
 *
 * O conteúdo fica no código, e não no banco, porque a imagem precisa estar no
 * bundle para funcionar sem internet na academia. O banco guarda só a chave.
 *
 * As ilustrações foram geradas no Meshy, em plano pago.
 */
export const MOVIMENTOS: Readonly<Record<string, MovimentoDeMobilidade>> = {
  'lateral-quadril': {
    nome: 'Lateral do quadril',
    foco: 'Lateral do quadril e da coxa',
    como: 'Cruze uma perna atrás da outra e incline o tronco suavemente para o lado oposto.',
    imagem: require('../../assets/images/mobilidade/lateral-quadril.png'),
  },
  'figura-4': {
    nome: 'Figura 4',
    foco: 'Glúteos',
    como: 'Deitado, apoie o tornozelo sobre a coxa oposta e aproxime as pernas do peito.',
    imagem: require('../../assets/images/mobilidade/figura-4.png'),
  },
  'flexores-quadril': {
    nome: 'Flexores do quadril',
    foco: 'Frente do quadril',
    como: 'Meio ajoelhado, contraia o glúteo de trás e avance suavemente a pelve.',
    imagem: require('../../assets/images/mobilidade/flexores-quadril.png'),
  },
  clamshell: {
    nome: 'Clamshell',
    foco: 'Glúteo médio · fortalecimento, não alongamento',
    como: 'De lado, abra o joelho de cima sem rodar a pelve.',
    imagem: require('../../assets/images/mobilidade/clamshell.png'),
  },
};
