// Inspired by react-hot-toast library
import { useState, useEffect } from "react";
import { emitUiSound } from "@/lib/uiSound.js";

const TOAST_LIMIT = 20;
// Atraso entre dispensar o toast e removê-lo do estado (tempo da animação de
// saída) — não é o tempo que ele fica na tela.
const TOAST_REMOVE_DELAY = 300;
// Tempo de exibição antes do toast se dispensar sozinho. Sem isto o toast só
// saía no clique do X e as mensagens iam se empilhando no canto da tela.
// Erros ficam mais tempo porque costumam trazer instrução para o jogador.
const TOAST_AUTO_DISMISS_MS = 5000;
const TOAST_AUTO_DISMISS_ERROR_MS = 8000;

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

const toastTimeouts = new Map();

const addToRemoveQueue = (toastId) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

// Timers de auto-dismiss, separados dos de remoção: um marca "hora de sair
// da tela", o outro "hora de sumir do estado". Guardados por id para que o X
// (dismiss manual) possa cancelar o automático e não disparar duas vezes.
const autoDismissTimeouts = new Map();

const clearAutoDismiss = (toastId) => {
  const timeout = autoDismissTimeouts.get(toastId);
  if (timeout) {
    clearTimeout(timeout);
    autoDismissTimeouts.delete(toastId);
  }
};

const scheduleAutoDismiss = (toastId, duration) => {
  if (!(duration > 0) || autoDismissTimeouts.has(toastId)) return;
  const timeout = setTimeout(() => {
    autoDismissTimeouts.delete(toastId);
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId });
  }, duration);
  autoDismissTimeouts.set(toastId, timeout);
};

const _clearFromRemoveQueue = (toastId) => {
  const timeout = toastTimeouts.get(toastId);
  if (timeout) {
    clearTimeout(timeout);
    toastTimeouts.delete(toastId);
  }
};

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners = [];

let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function toast({ ...props }) {
  const id = genId();
  const soundType = props.variant === "destructive" ? "error" : props.variant === "warning" ? "warning" : "success";
  emitUiSound(soundType, "toast");

  const update = (props) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...props, id },
    });

  const dismiss = () => {
    clearAutoDismiss(id);
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
  };

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  // `duration: 0` (ou negativo) mantém o toast até o jogador fechar — útil
  // para uma mensagem que exija ação. O padrão é sumir sozinho.
  const duration = props.duration !== undefined
    ? props.duration
    : (props.variant === 'destructive' ? TOAST_AUTO_DISMISS_ERROR_MS : TOAST_AUTO_DISMISS_MS);
  scheduleAutoDismiss(id, duration);

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId) => {
      _clearFromRemoveQueue(toastId);
      dispatch({ type: actionTypes.REMOVE_TOAST, toastId });
    },
  };
}

export { useToast, toast }; 