.PHONY: iniciar detener registros estado probar verificar

iniciar:
	docker compose up --build -d --wait

detener:
	docker compose down

registros:
	docker compose logs -f --tail=100

estado:
	docker compose ps

probar:
	docker compose exec -T app npm test

verificar:
	docker compose exec -T app npm run verificar
